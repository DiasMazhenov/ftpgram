import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import { clearDatabase, insertFolder, insertFile } from './db.js'

let client = null
let connected = false
let phoneCodeHash = ''

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

async function indexFiles() {
  console.log('📂 Индексация файлов...')
  clearDatabase()

  try {
    const dialogs = await client.getDialogs({ limit: 30 })
    let totalFiles = 0

    for (const dialog of dialogs) {
      const folderId = `chat_${dialog.id}`
      const fileIdPrefix = `${folderId}_msg`
      insertFolder(folderId, dialog.name || dialog.title || `Чат ${dialog.id}`)

      try {
        const messages = await client.getMessages(dialog.entity, { limit: 50 })

        for (const msg of messages) {
          if (!msg) continue

          // Пробуем все способы доступа к медиа
          const media = msg.media
          const photo = msg.photo
          const document = msg.document
          const file = msg.file

          let fileId, fileName, size, mimeType

          if (media && media.className === 'MessageMediaPhoto' && media.photo) {
            const p = media.photo
            fileId = `${fileIdPrefix}_${msg.id}_photo`
            const largest = p.sizes?.slice(-1)[0]
            size = Number(largest?.size || 0)
            fileName = `photo_${msg.id}.jpg`
            mimeType = 'image/jpeg'
          } else if (media && media.className === 'MessageMediaDocument' && media.document) {
            const doc = media.document
            fileId = `${fileIdPrefix}_${msg.id}_doc`
            size = Number(doc.size || 0)
            const nameAttr = doc.attributes?.find(a => a.className === 'DocumentAttributeFilename')
            fileName = nameAttr?.fileName || `file_${msg.id}`
            mimeType = doc.mimeType || 'application/octet-stream'
          } else if (photo) {
            fileId = `${fileIdPrefix}_${msg.id}_photo`
            size = 0
            fileName = `photo_${msg.id}.jpg`
            mimeType = 'image/jpeg'
          } else if (document) {
            fileId = `${fileIdPrefix}_${msg.id}_doc`
            size = Number(document.size || 0)
            const nameAttr = document.attributes?.find(a => a.className === 'DocumentAttributeFilename')
            fileName = nameAttr?.fileName || `file_${msg.id}`
            mimeType = document.mimeType || 'application/octet-stream'
          } else if (file) {
            fileId = `${fileIdPrefix}_${msg.id}_file`
            size = Number(file.size || 0)
            fileName = file.name || `file_${msg.id}`
            mimeType = file.mimeType || 'unknown'
          } else {
            continue
          }

          if (fileName) {
            insertFile(fileId, fileName, folderId, size || 0, mimeType, msg.id, dialog.id)
            totalFiles++
          }
        }
      } catch (e) {
        // Пропускаем чаты без доступа
        console.error(`  ⚠️ ${dialog.name}: ${e.message}`)
      }
    }

    console.log(`✅ Индексация завершена: ${totalFiles} файлов`)
  } catch (err) {
    console.error('❌ Ошибка индексации:', err.message)
  }
}

export async function disconnect() {
  if (client) {
    await client.disconnect()
    connected = false
  }
}
