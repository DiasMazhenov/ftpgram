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
  let totalFiles = 0

  try {
    const dialogs = await client.getDialogs({ limit: 30 })

    for (const dialog of dialogs) {
      const folderId = `chat_${dialog.id}`
      insertFolder(folderId, dialog.name || dialog.title || `Чат ${dialog.id}`)

      try {
        const messages = await client.getMessages(dialog.entity, { limit: 50 })

        for (const msg of messages) {
          if (!msg) continue
          const f = msg.file
          if (!f) continue

          const fileId = `msg_${msg.id}_${dialog.id}`
          const size = Number(f.size || 0)
          const name = f.name || `file_${msg.id}`

          insertFile(fileId, name, folderId, size, f.mimeType || 'unknown', msg.id, dialog.id)
          totalFiles++
        }
      } catch (e) {
        console.error(`  ⚠️ ${dialog.name}: ${e.message}`)
      }
    }

    console.log(`✅ Индексация: ${totalFiles} файлов`)
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
