import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { CustomFile } from 'telegram/client/uploads.js'
import {
  SAVED_MESSAGES_FOLDER_ID,
  STORAGE_FOLDER_ID,
  cleanupLegacyChatFolders,
  insertFile,
  removeMissingIndexedFiles,
  upsertIndexedFile
} from './db.js'

let client = null
let connected = false
let phoneCodeHash = ''
const DEFAULT_STORAGE_CHAT = 'FTPgram Storage'

// Сессия из переменной окружения (для Render)
const sessionString = process.env.TELEGRAM_SESSION || ''
let session = new StringSession(sessionString)

export function isConnected() {
  return connected
}

export function getSessionString() {
  return client ? client.session.save() : ''
}

// Авто-подключение при старте если есть сессия
export async function autoConnect() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID)
  const apiHash = process.env.TELEGRAM_API_HASH

  if (!apiId || !apiHash || !sessionString) return false

  try {
    client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 })
    await client.connect()
    connected = true
    console.log('✅ Авто-подключено к Telegram (сессия из env)')
    await indexFiles()
    return true
  } catch (err) {
    console.error('❌ Ошибка авто-подключения:', err.message)
    return false
  }
}

// Шаг 1: Отправляем код
export async function sendCode(phoneNumber) {
  const apiId = parseInt(process.env.TELEGRAM_API_ID)
  const apiHash = process.env.TELEGRAM_API_HASH

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID и TELEGRAM_API_HASH должны быть в .env')
  }

  client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 })
  await client.connect()

  const result = await client.sendCode({ apiId, apiHash }, phoneNumber)
  phoneCodeHash = result.phoneCodeHash
  return { success: true, message: 'Код отправлен в Telegram' }
}

// Шаг 2: Подтверждаем код
export async function signIn(phoneNumber, code, password = '') {
  if (!client) throw new Error('Сначала вызовите sendCode')

  const { Api } = await import('telegram')

  try {
    await client.invoke(
      new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode: code })
    )
  } catch (err) {
    if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
      if (!password) throw new Error('Нужен пароль 2FA')
      const { utils } = await import('telegram')
      const passwordResult = await client.invoke(new Api.account.GetPassword())
      await client.invoke(
        new Api.auth.CheckPassword({
          password: await utils.computeCheck(passwordResult, password)
        })
      )
    } else {
      throw err
    }
  }

  // Сохраняем сессию
  const savedSession = client.session.save()
  session = new StringSession(savedSession)

  connected = true
  console.log('✅ Подключено к Telegram')

  // Индексация
  await indexFiles()

  return {
    success: true,
    message: 'Подключено',
    session: savedSession
  }
}

// Индексация файлов (экспортируем для вызова из API)
export async function reindex() {
  await indexFiles()
}

export async function deleteTelegramFiles(files) {
  const validFiles = files.filter(file => file?.telegram_message_id)
  if (!validFiles.length) return
  if (!client || !connected) throw new Error('Нет подключения к Telegram')

  const groups = validFiles.reduce((result, file) => {
    const source = file.telegram_source || 'storage'
    if (!result.has(source)) result.set(source, [])
    result.get(source).push(file)
    return result
  }, new Map())

  for (const [source, sourceFiles] of groups) {
    const entity = source === 'saved'
      ? await client.getEntity('me')
      : await getStorageEntity(process.env.TELEGRAM_STORAGE_CHAT || DEFAULT_STORAGE_CHAT)
    await client.deleteMessages(
      entity,
      sourceFiles.map(file => file.telegram_message_id),
      { revoke: true }
    )
  }
}

async function getStorageEntity(storageChat) {
  try {
    return await client.getEntity(storageChat)
  } catch {
    const dialogs = await client.getDialogs({ limit: 100 })
    const dialog = dialogs.find(item => item.name === 'FTPgram Storage' || item.title === 'FTPgram Storage')
    if (!dialog) throw new Error(`Telegram storage "${storageChat}" не найден`)
    return dialog.entity
  }
}

export async function uploadFile(filePath, name, size, mimeType, folderId = null) {
  if (!client || !connected) throw new Error('Нет подключения к Telegram')

  const source = folderId === SAVED_MESSAGES_FOLDER_ID ? 'saved' : 'storage'
  const targetFolderId = folderId || STORAGE_FOLDER_ID
  const entity = source === 'saved'
    ? await client.getEntity('me')
    : await getStorageEntity(process.env.TELEGRAM_STORAGE_CHAT || DEFAULT_STORAGE_CHAT)
  const message = await client.sendFile(entity, {
    file: new CustomFile(name, size, filePath),
    forceDocument: true
  })
  const id = `${source}_msg_${message.id}`
  const chatId = Number(entity?.id || 0) || null
  const sourceCreatedAt = normalizeTelegramDate(message.date) || new Date().toISOString()

  insertFile(id, name, targetFolderId, size, mimeType, message.id, chatId, source, sourceCreatedAt)
  return { id, name, size, mime_type: mimeType, folder_id: targetFolderId, type: 'file' }
}

function normalizeTelegramDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function indexMessages(messages, entity, { prefix, folderId, source }) {
  let count = 0
  const messageIds = []
  for (const msg of messages) {
    if (!msg?.file) continue

    const file = msg.file
    messageIds.push(msg.id)
    const id = `${prefix}_msg_${msg.id}`
    upsertIndexedFile(
      id,
      file.name || `file_${msg.id}`,
      Number(file.size || 0),
      file.mimeType || 'unknown',
      msg.id,
      Number(entity?.id || 0) || null,
      folderId,
      source,
      normalizeTelegramDate(msg.date),
      normalizeTelegramDate(msg.editDate || msg.date)
    )
    count++
  }
  removeMissingIndexedFiles(source, messageIds)
  return count
}

async function indexFiles() {
  console.log('📂 Индексация файлов...')
  cleanupLegacyChatFolders()
  let totalFiles = 0
  const configuredLimit = Number(process.env.TELEGRAM_INDEX_LIMIT || 5000)
  const indexLimit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 5000

  try {
    const storageChat = process.env.TELEGRAM_STORAGE_CHAT || DEFAULT_STORAGE_CHAT
    const storageEntity = await getStorageEntity(storageChat)
    const storageMessages = await client.getMessages(storageEntity, { limit: indexLimit })

    totalFiles += indexMessages(storageMessages, storageEntity, {
      prefix: 'storage',
      folderId: STORAGE_FOLDER_ID,
      source: 'storage'
    })
  } catch (err) {
    console.error('❌ Ошибка индексации FTPgram Storage:', err.message)
  }

  try {
    const savedEntity = await client.getEntity('me')
    const savedMessages = await client.getMessages(savedEntity, { limit: indexLimit })
    totalFiles += indexMessages(savedMessages, savedEntity, {
      prefix: 'saved',
      folderId: SAVED_MESSAGES_FOLDER_ID,
      source: 'saved'
    })
  } catch (err) {
    console.error('❌ Ошибка индексации Избранного:', err.message)
  }

  console.log(`✅ Индексация Telegram Drive: ${totalFiles} файлов`)
}

export async function downloadTelegramFile(file, outputFile) {
  if (!client || !connected) throw new Error('Нет подключения к Telegram')
  if (!file?.telegram_message_id) throw new Error('Telegram-сообщение файла не найдено')

  const entity = file.telegram_source === 'saved'
    ? await client.getEntity('me')
    : await getStorageEntity(process.env.TELEGRAM_STORAGE_CHAT || DEFAULT_STORAGE_CHAT)
  const messages = await client.getMessages(entity, { ids: file.telegram_message_id })
  const message = messages[0]
  if (!message?.media) throw new Error('Файл больше не найден в Telegram')

  await client.downloadMedia(message, { outputFile })
  return outputFile
}

export async function disconnect() {
  if (client) {
    await client.disconnect()
    connected = false
  }
}
