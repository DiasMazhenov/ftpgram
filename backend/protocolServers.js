import { createRequire } from 'node:module'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  createFolder,
  deleteFile,
  getFileById,
  getFileTree,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder,
  trashFolder
} from './db.js'
import {
  deleteTelegramFiles,
  downloadTelegramFile,
  uploadFile
} from './telegram.js'

const require = createRequire(import.meta.url)
const { FtpSrv, FileSystem, ftpErrors: errors } = require('ftp-srv')
let ftpServerInstance = null

const RESET_ERROR_CODES = new Set(['ECONNRESET', 'EPIPE', 'ERR_STREAM_DESTROYED'])
const RESET_ERROR_PATTERNS = [
  'Socket not writable',
  'write ECONNRESET',
  'read ECONNRESET'
]

const XML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;'
}

function escapeXml(value = '') {
  return String(value).replace(/[&<>"']/g, char => XML_ESCAPE[char])
}

function normalizeProtocolPath(value = '/') {
  const pathname = value.includes('://') ? new URL(value).pathname : value
  const withoutMount = pathname.replace(/^\/webdav(?=\/|$)/, '')
  const parts = withoutMount
    .split('/')
    .filter(Boolean)
    .map(part => decodeURIComponent(part))
  return `/${parts.join('/')}`
}

function encodeHref(mountPath, protocolPath) {
  const parts = normalizeProtocolPath(protocolPath).split('/').filter(Boolean)
  const suffix = parts.map(part => encodeURIComponent(part)).join('/')
  return `${mountPath}${suffix ? `/${suffix}` : '/'}`
}

function makeStat(item, name = item?.name) {
  const isDirectory = item?.type === 'folder' || item?.kind === 'directory'
  const date = new Date(item?.date_modified || item?.modified_at || item?.date_added || Date.now())
  return {
    name,
    size: isDirectory ? 0 : Number(item?.size || 0),
    mtime: date,
    ctime: date,
    birthtime: date,
    mode: isDirectory ? 0o755 : 0o644,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isSymbolicLink: () => false
  }
}

function resolvePath(protocolPath = '/') {
  const normalized = normalizeProtocolPath(protocolPath)
  const segments = normalized.split('/').filter(Boolean)
  if (!segments.length) {
    return {
      path: '/',
      parentId: null,
      item: { id: null, name: '', type: 'folder', kind: 'directory' },
      name: ''
    }
  }

  let parentId = null
  let item = null
  for (const segment of segments) {
    item = getFileTree(parentId).find(entry => entry.name === segment)
    if (!item) return null
    if (segment !== segments[segments.length - 1]) {
      if (item.type !== 'folder') return null
      parentId = item.id
    }
  }

  return {
    path: normalized,
    parentId,
    item,
    name: segments[segments.length - 1]
  }
}

function resolveParent(protocolPath = '/') {
  const normalized = normalizeProtocolPath(protocolPath)
  const segments = normalized.split('/').filter(Boolean)
  const name = segments.pop()
  if (!name) return null
  const parentPath = `/${segments.join('/')}`
  const parent = resolvePath(parentPath)
  if (!parent || parent.item.type !== 'folder') return null
  return {
    parent,
    parentId: parent.item.id || null,
    name,
    path: normalized
  }
}

function listChildren(protocolPath = '/') {
  const resolved = resolvePath(protocolPath)
  if (!resolved || resolved.item.type !== 'folder') return null
  const folderId = resolved.item.id || null
  return getFileTree(folderId)
}

async function hardDeleteFile(file) {
  await deleteTelegramFiles([file])
  deleteFile(file.id)
}

async function deleteDriveItem(item) {
  if (item.type === 'file') {
    const file = getFileById(item.id)
    await hardDeleteFile(file)
    return
  }
  trashFolder(item.id)
}

async function uploadDriveFile(protocolPath, input, mimeType = 'application/octet-stream') {
  const target = resolveParent(protocolPath)
  if (!target) throw new Error('Папка назначения не найдена')

  const existing = resolvePath(protocolPath)
  if (existing?.item?.type === 'folder') throw new Error('Нельзя заменить папку файлом')
  if (existing?.item?.type === 'file') {
    const file = getFileById(existing.item.id)
    await hardDeleteFile(file)
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ftpgram-protocol-upload-'))
  const tempPath = path.join(tempDir, 'upload')
  try {
    await pipeline(input, createWriteStream(tempPath))
    const fileStats = await stat(tempPath)
    return await uploadFile(tempPath, target.name, fileStats.size, mimeType, target.parentId)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function createDownloadStream(item, start = undefined) {
  const file = getFileById(item.id)
  if (!file?.telegram_message_id) throw new Error('Файл не найден')

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ftpgram-protocol-download-'))
  const tempPath = path.join(tempDir, file.name)
  await downloadTelegramFile(file, tempPath)
  const stream = createReadStream(tempPath, { start })
  const cleanup = () => rm(tempDir, { recursive: true, force: true }).catch(() => {})
  stream.once('close', cleanup)
  stream.once('error', cleanup)
  return { stream, file }
}

function sendWebDavError(res, status, message) {
  res.status(status).type('text/plain').send(message)
}

function propResponse(mountPath, protocolPath, item) {
  const stat = makeStat(item)
  const href = encodeHref(mountPath, protocolPath)
  const isDirectory = stat.isDirectory()
  return `
    <d:response>
      <d:href>${escapeXml(href)}</d:href>
      <d:propstat>
        <d:prop>
          <d:displayname>${escapeXml(item.name || 'FTPgram')}</d:displayname>
          <d:resourcetype>${isDirectory ? '<d:collection/>' : ''}</d:resourcetype>
          <d:getcontentlength>${stat.size}</d:getcontentlength>
          <d:getlastmodified>${stat.mtime.toUTCString()}</d:getlastmodified>
          <d:getcontenttype>${escapeXml(isDirectory ? 'httpd/unix-directory' : (item.mime_type || 'application/octet-stream'))}</d:getcontenttype>
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`
}

function checkProtocolAuth(req, res) {
  const username = process.env.FTPGRAM_PROTOCOL_USER
  const password = process.env.FTPGRAM_PROTOCOL_PASSWORD
  if (!username && !password) return true

  const header = req.headers.authorization || ''
  const [, token] = header.split(' ')
  const decoded = token ? Buffer.from(token, 'base64').toString('utf8') : ''
  if (header.startsWith('Basic ') && decoded === `${username}:${password}`) return true

  res.setHeader('WWW-Authenticate', 'Basic realm="FTPgram"')
  res.status(401).send('Authentication required')
  return false
}

function isExpectedSocketReset(errorOrMessage, message = '') {
  const code = errorOrMessage?.code || errorOrMessage?.err?.code
  const text = [
    typeof errorOrMessage === 'string' ? errorOrMessage : '',
    errorOrMessage?.message || '',
    errorOrMessage?.error || '',
    message
  ].filter(Boolean).join(' ')

  return RESET_ERROR_CODES.has(code) || RESET_ERROR_PATTERNS.some(pattern => text.includes(pattern))
}

function createFtpLogger() {
  const logger = {
    child: () => logger,
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: (...args) => console.warn('[ftp]', ...args),
    error: (...args) => {
      if (isExpectedSocketReset(args[0], args[1])) return
      console.error('[ftp]', ...args)
    }
  }
  return logger
}

export function createWebDavHandler({ mountPath = '/webdav', isEnabled = () => true } = {}) {
  return async (req, res) => {
    if (!isEnabled()) return sendWebDavError(res, 503, 'WebDAV disabled')
    if (!checkProtocolAuth(req, res)) return
    const protocolPath = normalizeProtocolPath(req.originalUrl || req.url)

    try {
      if (req.method === 'OPTIONS') {
        res.setHeader('DAV', '1, 2')
        res.setHeader('Allow', 'OPTIONS, PROPFIND, GET, HEAD, PUT, DELETE, MKCOL, MOVE')
        res.status(204).end()
        return
      }

      if (req.method === 'PROPFIND') {
        const resolved = resolvePath(protocolPath)
        if (!resolved) return sendWebDavError(res, 404, 'Not found')
        const depth = req.headers.depth || '1'
        const responses = [propResponse(mountPath, protocolPath, resolved.item)]
        if (depth !== '0' && resolved.item.type === 'folder') {
          const children = listChildren(protocolPath) || []
          for (const child of children) {
            responses.push(propResponse(mountPath, `${protocolPath.replace(/\/$/, '')}/${child.name}`, child))
          }
        }
        res.status(207)
          .type('application/xml; charset=utf-8')
          .send(`<?xml version="1.0" encoding="utf-8"?><d:multistatus xmlns:d="DAV:">${responses.join('')}</d:multistatus>`)
        return
      }

      if (req.method === 'GET' || req.method === 'HEAD') {
        const resolved = resolvePath(protocolPath)
        if (!resolved || resolved.item.type !== 'file') return sendWebDavError(res, 404, 'Not found')
        const file = getFileById(resolved.item.id)
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream')
        res.setHeader('Content-Length', String(file.size || 0))
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`)
        if (req.method === 'HEAD') return res.end()
        const { stream } = await createDownloadStream(resolved.item)
        stream.pipe(res)
        return
      }

      if (req.method === 'PUT') {
        await uploadDriveFile(protocolPath, req, req.headers['content-type'] || 'application/octet-stream')
        res.status(201).end()
        return
      }

      if (req.method === 'MKCOL') {
        const target = resolveParent(protocolPath)
        if (!target) return sendWebDavError(res, 409, 'Parent not found')
        if (resolvePath(protocolPath)) return sendWebDavError(res, 405, 'Already exists')
        createFolder(target.name, target.parentId)
        res.status(201).end()
        return
      }

      if (req.method === 'DELETE') {
        const resolved = resolvePath(protocolPath)
        if (!resolved || !resolved.item.id) return sendWebDavError(res, 404, 'Not found')
        await deleteDriveItem(resolved.item)
        res.status(204).end()
        return
      }

      if (req.method === 'MOVE') {
        const resolved = resolvePath(protocolPath)
        const destination = req.headers.destination
        if (!resolved || !destination) return sendWebDavError(res, 404, 'Not found')
        const target = resolveParent(destination)
        if (!target) return sendWebDavError(res, 409, 'Destination parent not found')
        if (resolved.item.type === 'file') {
          if (resolved.item.name !== target.name) renameFile(resolved.item.id, target.name)
          moveFile(resolved.item.id, target.parentId)
        } else {
          if (resolved.item.name !== target.name) renameFolder(resolved.item.id, target.name)
          moveFolder(resolved.item.id, target.parentId)
        }
        res.status(201).end()
        return
      }

      sendWebDavError(res, 405, 'Method not allowed')
    } catch (err) {
      sendWebDavError(res, 500, err.message)
    }
  }
}

class FtpgramFileSystem extends FileSystem {
  _resolveProtocolPath(value = '.') {
    if (value === '.') return this.cwd
    if (value === '..') {
      const parts = this.cwd.split('/').filter(Boolean)
      parts.pop()
      return `/${parts.join('/')}`
    }
    if (path.posix.isAbsolute(value)) return normalizeProtocolPath(value)
    return normalizeProtocolPath(path.posix.join(this.cwd, value))
  }

  currentDirectory() {
    return this.cwd
  }

  async get(fileName = '.') {
    const protocolPath = this._resolveProtocolPath(fileName)
    const resolved = resolvePath(protocolPath)
    if (!resolved) throw new errors.FileSystemError('Not found', 550)
    return makeStat(resolved.item, resolved.name || '/')
  }

  async list(value = '.') {
    const protocolPath = this._resolveProtocolPath(value)
    const children = listChildren(protocolPath)
    if (!children) throw new errors.FileSystemError('Not a directory', 550)
    return children.map(child => makeStat(child, child.name))
  }

  async chdir(value = '.') {
    const protocolPath = this._resolveProtocolPath(value)
    const resolved = resolvePath(protocolPath)
    if (!resolved || resolved.item.type !== 'folder') throw new errors.FileSystemError('Not a directory', 550)
    this.cwd = protocolPath
    return this.cwd
  }

  async mkdir(value = '.') {
    const protocolPath = this._resolveProtocolPath(value)
    const target = resolveParent(protocolPath)
    if (!target) throw new errors.FileSystemError('Parent not found', 550)
    createFolder(target.name, target.parentId)
    return protocolPath
  }

  write(fileName, { append = false, start = undefined } = {}) {
    if (append || start) throw new errors.FileSystemError('Partial writes are not supported', 550)
    const protocolPath = this._resolveProtocolPath(fileName)
    const input = new PassThrough()
    const done = uploadDriveFile(protocolPath, input)
    const stream = new Writable({
      write(chunk, encoding, callback) {
        input.write(chunk, encoding, callback)
      },
      final(callback) {
        input.end()
        done.then(() => callback()).catch(callback)
      },
      destroy(error, callback) {
        input.destroy(error || undefined)
        callback(error)
      }
    })
    return { stream, clientPath: protocolPath }
  }

  async read(fileName, { start = undefined } = {}) {
    const protocolPath = this._resolveProtocolPath(fileName)
    const resolved = resolvePath(protocolPath)
    if (!resolved || resolved.item.type !== 'file') throw new errors.FileSystemError('Not a file', 550)
    return {
      ...(await createDownloadStream(resolved.item, start)),
      clientPath: protocolPath
    }
  }

  async delete(value) {
    const protocolPath = this._resolveProtocolPath(value)
    const resolved = resolvePath(protocolPath)
    if (!resolved || !resolved.item.id) throw new errors.FileSystemError('Not found', 550)
    await deleteDriveItem(resolved.item)
  }

  async rename(from, to) {
    const source = resolvePath(this._resolveProtocolPath(from))
    const target = resolveParent(this._resolveProtocolPath(to))
    if (!source || !target) throw new errors.FileSystemError('Not found', 550)
    if (source.item.type === 'file') {
      if (source.item.name !== target.name) renameFile(source.item.id, target.name)
      moveFile(source.item.id, target.parentId)
      return
    }
    if (source.item.name !== target.name) renameFolder(source.item.id, target.name)
    moveFolder(source.item.id, target.parentId)
  }
}

export function startFtpServer() {
  if (process.env.FTP_ENABLED === 'false') return null
  if (ftpServerInstance) return ftpServerInstance
  const port = Number(process.env.FTP_PORT || 2121)
  const host = process.env.FTP_HOST || '0.0.0.0'
  const server = new FtpSrv({
    url: `ftp://${host}:${port}`,
    pasv_url: process.env.FTP_PASV_URL || '127.0.0.1',
    pasv_min: Number(process.env.FTP_PASV_MIN || 40000),
    pasv_max: Number(process.env.FTP_PASV_MAX || 40100),
    anonymous: !process.env.FTPGRAM_PROTOCOL_USER,
    greeting: 'FTPgram',
    log: createFtpLogger()
  })

  server.on('client-error', ({ error }) => {
    if (isExpectedSocketReset(error)) return
    console.error('❌ FTP client error:', error.message)
  })

  server.on('login', ({ connection, username, password }, resolve, reject) => {
    const expectedUser = process.env.FTPGRAM_PROTOCOL_USER
    const expectedPassword = process.env.FTPGRAM_PROTOCOL_PASSWORD || ''
    if (!expectedUser || (username === expectedUser && password === expectedPassword)) {
      resolve({ fs: new FtpgramFileSystem(connection, { root: '/', cwd: '/' }) })
      return
    }
    reject(new errors.GeneralError('Invalid username or password', 401))
  })

  server.listen()
    .then(() => console.log(`📡 FTP server: ftp://${host}:${port}`))
    .catch(err => {
      ftpServerInstance = null
      console.error('❌ FTP server error:', err.message)
    })

  ftpServerInstance = server
  return server
}

export async function stopFtpServer() {
  if (!ftpServerInstance) return
  const server = ftpServerInstance
  ftpServerInstance = null
  await server.close()
}

export function isFtpServerRunning() {
  return Boolean(ftpServerInstance)
}
