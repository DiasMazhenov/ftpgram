import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import crypto from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import {
  initDatabase,
  getDatabase,
  getAuditLogs,
  getFileTree,
  getFileById,
  SAVED_MESSAGES_FOLDER_ID,
  STORAGE_FOLDER_ID,
  getAllFolders,
  getTrashFiles,
  getTrashItems,
  createFolder,
  deleteFile,
  logAudit,
  moveFile,
  moveFolder,
  permanentlyDeleteTrashItem,
  renameFile,
  renameFolder,
  restoreTrashItem,
  trashFolder
} from './db.js'
import {
  sendCode,
  signIn,
  isConnected,
  disconnect,
  autoConnect,
  getSyncStatus,
  reindex,
  deleteTelegramFiles,
  downloadTelegramFile,
  uploadFile
} from './telegram.js'
import {
  createWebDavHandler,
  isFtpServerRunning,
  startFtpServer,
  stopFtpServer
} from './protocolServers.js'

const app = express()
const PORT = process.env.PORT || 4000
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])
const DOWNLOAD_CACHE_DIR = process.env.DOWNLOAD_CACHE_DIR || path.join(os.tmpdir(), 'ftpgram-download-cache')
const APP_TOKEN = process.env.FTPGRAM_APP_TOKEN || process.env.FTPGRAM_AUTH_TOKEN || ''
const downloadCacheJobs = new Map()
const protocolState = {
  ftp: process.env.FTP_ENABLED !== 'false',
  webdav: process.env.WEBDAV_ENABLED !== 'false'
}

app.use('/webdav', createWebDavHandler({
  mountPath: '/webdav',
  isEnabled: () => protocolState.webdav
}))
app.use(cors())
app.use(express.json())

function isOfficeFile(file) {
  const extension = file?.name?.split('.').pop()?.toLowerCase()
  return OFFICE_EXTENSIONS.has(extension)
}

function getViewerSecret() {
  return process.env.GOOGLE_VIEWER_SECRET
    || process.env.TELEGRAM_SESSION
    || process.env.TELEGRAM_API_HASH
    || 'ftpgram-local-viewer-secret'
}

function signPublicFile(id, expires) {
  return crypto
    .createHmac('sha256', getViewerSecret())
    .update(`${id}.${expires}`)
    .digest('hex')
}

function isValidSignature(id, expires, signature) {
  if (!expires || !signature || Number(expires) < Date.now()) return false
  const expected = signPublicFile(id, expires)
  const received = String(signature)
  if (received.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

function getPublicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '')
  const protocol = req.get('x-forwarded-proto') || req.protocol
  return `${protocol}://${req.get('host')}`
}

function getRequestToken(req) {
  const authHeader = req.get('authorization') || ''
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7)
  return req.get('x-ftpgram-token') || req.query.appToken || ''
}

function isValidAppToken(token) {
  if (!APP_TOKEN) return true
  const expected = Buffer.from(APP_TOKEN)
  const received = Buffer.from(String(token || ''))
  return received.length === expected.length && crypto.timingSafeEqual(received, expected)
}

function requireAppAuth(req, res, next) {
  if (req.path.startsWith('/public/files/')) return next()
  if (isValidAppToken(getRequestToken(req))) return next()
  res.status(401).json({ error: 'Требуется вход в FTPgram' })
}

function getDownloadCachePath(file) {
  const hash = crypto
    .createHash('sha256')
    .update(`${file.id}:${file.telegram_message_id}:${file.size || 0}`)
    .digest('hex')
  return path.join(DOWNLOAD_CACHE_DIR, hash)
}

async function fileExists(filePath) {
  try {
    const fileStats = await stat(filePath)
    return fileStats.isFile() && fileStats.size > 0
  } catch {
    return false
  }
}

async function ensureCachedDownload(file) {
  const cachePath = getDownloadCachePath(file)
  if (await fileExists(cachePath)) return cachePath

  const existingJob = downloadCacheJobs.get(cachePath)
  if (existingJob) return existingJob

  const job = (async () => {
    await mkdir(DOWNLOAD_CACHE_DIR, { recursive: true })
    const partialPath = `${cachePath}.${crypto.randomUUID()}.part`
    try {
      await downloadTelegramFile(file, partialPath)
      await rename(partialPath, cachePath)
      return cachePath
    } catch (error) {
      await rm(partialPath, { force: true }).catch(() => {})
      throw error
    } finally {
      downloadCacheJobs.delete(cachePath)
    }
  })()

  downloadCacheJobs.set(cachePath, job)
  return job
}

app.get('/api/auth/status', (req, res) => {
  const required = Boolean(APP_TOKEN)
  res.json({
    required,
    authenticated: !required || isValidAppToken(getRequestToken(req))
  })
})

app.post('/api/auth/verify', (req, res) => {
  if (!APP_TOKEN) return res.json({ success: true })
  if (!isValidAppToken(req.body?.token)) return res.status(401).json({ error: 'Неверный ключ доступа' })
  res.json({ success: true })
})

app.use('/api', requireAppAuth)

// Статус
app.get('/api/status', (req, res) => {
  const host = req.get('host') || `localhost:${PORT}`
  const protocol = req.get('x-forwarded-proto') || req.protocol
  const ftpPort = Number(process.env.FTP_PORT || 2121)
  res.json({
    connected: isConnected(),
    timestamp: new Date().toISOString(),
    sync: getSyncStatus(),
    protocols: {
      ftp: {
        enabled: protocolState.ftp && isFtpServerRunning(),
        port: ftpPort,
        url: `ftp://${process.env.FTP_PUBLIC_HOST || 'localhost'}:${ftpPort}`
      },
      webdav: {
        enabled: protocolState.webdav,
        path: '/webdav',
        url: `${protocol}://${host}/webdav`
      }
    }
  })
})

app.patch('/api/protocols/:name', async (req, res) => {
  try {
    const { name } = req.params
    const enabled = Boolean(req.body?.enabled)
    if (!['ftp', 'webdav'].includes(name)) return res.status(400).json({ error: 'Неизвестный протокол' })

    protocolState[name] = enabled
    if (name === 'ftp') {
      if (enabled) startFtpServer()
      else await stopFtpServer()
    }

    logAudit('toggle_protocol', {
      itemType: 'protocol',
      itemId: name,
      itemName: name.toUpperCase(),
      details: { enabled }
    })
    res.json({ success: true, name, enabled })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Шаг 1: Отправить код
app.post('/api/connect', async (req, res) => {
  try {
    const { phone } = req.body
    if (!phone) return res.status(400).json({ error: 'Номер телефона обязателен' })
    const result = await sendCode(phone)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Шаг 2: Подтвердить код
app.post('/api/verify', async (req, res) => {
  try {
    const { phone, code, password } = req.body
    if (!phone || !code) return res.status(400).json({ error: 'Номер и код обязательны' })
    const result = await signIn(phone, code, password || '')
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Отключиться
app.post('/api/disconnect', async (req, res) => {
  await disconnect()
  res.json({ success: true })
})

// Файловая структура
app.get('/api/files', (req, res) => {
  const folder = req.query.folder || null
  res.json(getFileTree(folder))
})

app.get('/api/trash', (req, res) => {
  res.json(getTrashItems())
})

app.get('/api/audit-log', (req, res) => {
  res.json(getAuditLogs(req.query.limit || 20))
})

// Принудительная переиндексация
app.post('/api/reindex', async (req, res) => {
  try {
    await reindex()
    logAudit('reindex', {
      itemType: 'system',
      itemId: 'telegram',
      itemName: 'Telegram'
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/upload', async (req, res) => {
  let tempDir
  try {
    if (!isConnected()) return res.status(503).json({ error: 'Нет подключения к Telegram' })

    const rawName = req.headers['x-file-name']
    if (!rawName) return res.status(400).json({ error: 'Имя файла обязательно' })

    const name = path.basename(decodeURIComponent(rawName))
    const folderId = req.headers['x-folder-id'] || null
    const maxSize = Number(process.env.MAX_UPLOAD_SIZE || 2 * 1024 * 1024 * 1024)
    const contentLength = Number(req.headers['content-length'] || 0)
    if (contentLength > maxSize) return res.status(413).json({ error: 'Файл превышает допустимый размер' })

    tempDir = await mkdtemp(path.join(os.tmpdir(), 'ftpgram-upload-'))
    const tempPath = path.join(tempDir, 'upload')
    await pipeline(req, createWriteStream(tempPath))
    const fileStats = await stat(tempPath)
    if (fileStats.size > maxSize) return res.status(413).json({ error: 'Файл превышает допустимый размер' })

    const file = await uploadFile(
      tempPath,
      name,
      fileStats.size,
      req.headers['content-type'] || 'application/octet-stream',
      folderId
    )
    logAudit('upload_file', {
      itemType: 'file',
      itemId: file.id,
      itemName: file.name,
      details: { folderId: file.folder_id, size: file.size }
    })
    res.status(201).json(file)
  } catch (err) {
    res.status(500).json({ error: err.message })
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true })
  }
})

app.get('/api/files/:id/download', async (req, res) => {
  try {
    const file = getFileById(req.params.id)
    if (!file?.telegram_message_id) return res.status(404).json({ error: 'Файл не найден' })

    const cachedPath = await ensureCachedDownload(file)
    const cleanup = error => {
      if (error && !res.headersSent) res.status(500).json({ error: error.message })
    }

    if (req.query.inline === '1') {
      res.type(file.mime_type || 'application/octet-stream')
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`)
      res.sendFile(cachedPath, cleanup)
    } else {
      res.download(cachedPath, file.name, cleanup)
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/:id/prepare-download', async (req, res) => {
  try {
    const file = getFileById(req.params.id)
    if (!file?.telegram_message_id) return res.status(404).json({ error: 'Файл не найден' })

    await ensureCachedDownload(file)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/files/:id/google-docs', (req, res) => {
  const file = getFileById(req.params.id)
  if (!file?.telegram_message_id) return res.status(404).json({ error: 'Файл не найден' })
  if (!isOfficeFile(file)) return res.status(400).json({ error: 'Этот формат не поддерживается Google Docs' })

  const expires = Date.now() + 5 * 60 * 1000
  const signature = signPublicFile(file.id, expires)
  const publicUrl = new URL(`/api/public/files/${encodeURIComponent(file.id)}`, getPublicBaseUrl(req))
  publicUrl.searchParams.set('expires', String(expires))
  publicUrl.searchParams.set('signature', signature)

  const viewerUrl = new URL('https://docs.google.com/gview')
  viewerUrl.searchParams.set('url', publicUrl.toString())
  res.json({ url: viewerUrl.toString(), expires })
})

app.get('/api/public/files/:id', async (req, res) => {
  try {
    if (!isValidSignature(req.params.id, req.query.expires, req.query.signature)) {
      return res.status(403).json({ error: 'Ссылка недействительна или устарела' })
    }

    const file = getFileById(req.params.id)
    if (!file?.telegram_message_id || !isOfficeFile(file)) {
      return res.status(404).json({ error: 'Файл не найден' })
    }

    const cachedPath = await ensureCachedDownload(file)
    res.type(file.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`)
    res.sendFile(cachedPath, error => {
      if (error && !res.headersSent) res.status(500).json({ error: error.message })
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/folders', (req, res) => {
  res.json(getAllFolders())
})

app.post('/api/folders', (req, res) => {
  try {
    const { name, parentId = null } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })
    const folder = createFolder(name, parentId)
    logAudit('create_folder', {
      itemType: 'folder',
      itemId: folder.id,
      itemName: folder.name,
      details: { parentId }
    })
    res.status(201).json(folder)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/folders/:id', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })
  const folder = getFileById(req.params.id)
  renameFolder(req.params.id, name)
  logAudit('rename_folder', {
    itemType: 'folder',
    itemId: req.params.id,
    itemName: name,
    details: { from: folder?.name, to: name }
  })
  res.json(getFileById(req.params.id))
})

app.delete('/api/folders/:id', async (req, res) => {
  try {
    if ([SAVED_MESSAGES_FOLDER_ID, STORAGE_FOLDER_ID].includes(req.params.id)) {
      return res.status(400).json({ error: 'Системную папку нельзя удалить' })
    }
    const folder = getFileById(req.params.id)
    trashFolder(req.params.id)
    logAudit('trash_folder', {
      itemType: 'folder',
      itemId: req.params.id,
      itemName: folder?.name
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/files/:id', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название файла обязательно' })
  const file = getFileById(req.params.id)
  renameFile(req.params.id, name)
  logAudit('rename_file', {
    itemType: 'file',
    itemId: req.params.id,
    itemName: name,
    details: { from: file?.name, to: name }
  })
  res.json(getFileById(req.params.id))
})

app.delete('/api/files/:id', async (req, res) => {
  try {
    const file = getFileById(req.params.id)
    if (!file) return res.status(404).json({ error: 'Файл не найден' })
    if (file.deleted_at) return res.status(404).json({ error: 'Файл уже в корзине' })
    await deleteTelegramFiles([file])
    deleteFile(req.params.id)
    logAudit('delete_file', {
      itemType: 'file',
      itemId: req.params.id,
      itemName: file.name,
      details: { source: file.telegram_source }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/trash/:type/:id/restore', (req, res) => {
  try {
    const { type, id } = req.params
    if (!['file', 'folder'].includes(type)) return res.status(400).json({ error: 'Неизвестный тип элемента' })
    const item = getFileById(id)
    restoreTrashItem(type, id)
    logAudit('restore_item', {
      itemType: type,
      itemId: id,
      itemName: item?.name
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/trash/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params
    if (!['file', 'folder'].includes(type)) return res.status(400).json({ error: 'Неизвестный тип элемента' })
    const item = getFileById(id)
    const files = getTrashFiles(type, id)
    await deleteTelegramFiles(files)
    permanentlyDeleteTrashItem(type, id)
    logAudit('delete_forever', {
      itemType: type,
      itemId: id,
      itemName: item?.name,
      details: { files: files.length }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/trash', async (req, res) => {
  try {
    const items = getTrashItems()
    const filesCount = items.reduce((count, item) => count + getTrashFiles(item.type, item.id).length, 0)
    await purgeTrash(items)
    logAudit('empty_trash', {
      itemType: 'trash',
      itemId: 'virtual_trash',
      itemName: 'Корзина',
      details: { items: items.length, files: filesCount }
    })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/move', (req, res) => {
  const { id, type, folderId = null } = req.body
  if (!id || !type) return res.status(400).json({ error: 'id и type обязательны' })
  const item = getFileById(id)

  if (type === 'folder') moveFolder(id, folderId)
  else if (type === 'file') moveFile(id, folderId)
  else return res.status(400).json({ error: 'Неизвестный тип элемента' })

  logAudit('move_item', {
    itemType: type,
    itemId: id,
    itemName: item?.name,
    details: { folderId }
  })
  res.json({ success: true })
})

// Инфо о файле
app.get('/api/files/:id', (req, res) => {
  const file = getFileById(req.params.id)
  if (!file) return res.status(404).json({ error: 'Файл не найден' })
  res.json(file)
})

// Статистика
app.get('/api/stats', (req, res) => {
  const db = getDatabase()
  const files = db.prepare('SELECT COUNT(*) as count FROM files WHERE deleted_at IS NULL').get().count
  const folders = db.prepare('SELECT COUNT(*) as count FROM folders WHERE deleted_at IS NULL').get().count
  const totalSize = db.prepare('SELECT SUM(size) as total FROM files WHERE deleted_at IS NULL').get().total || 0
  res.json({ files, folders, totalSize })
})

async function purgeTrash(items) {
  for (const item of items) {
    const files = getTrashFiles(item.type, item.id)
    await deleteTelegramFiles(files)
    permanentlyDeleteTrashItem(item.type, item.id)
  }
}

async function purgeExpiredTrash() {
  if (!isConnected()) return
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const expiredItems = getTrashItems(cutoff)
  if (!expiredItems.length) return
  await purgeTrash(expiredItems)
  console.log(`🧹 Корзина очищена: ${expiredItems.length} элементов`)
}

async function start() {
  initDatabase()
  console.log('📦 SQLite база готова')

  // Пробуем авто-подключиться если есть сохранённая сессия
  await autoConnect()
  purgeExpiredTrash().catch(err => console.error('❌ Ошибка автоочистки корзины:', err.message))
  setInterval(() => {
    purgeExpiredTrash().catch(err => console.error('❌ Ошибка автоочистки корзины:', err.message))
  }, 24 * 60 * 60 * 1000)
  if (protocolState.ftp) startFtpServer()

  app.listen(PORT, () => {
    console.log(`🚀 FTPgram Backend: http://localhost:${PORT}`)
    console.log(`📡 WebDAV: http://localhost:${PORT}/webdav`)
  })
}

start()
