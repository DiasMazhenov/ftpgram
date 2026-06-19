import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import readline from 'readline'
import { clearDatabase, insertFolder, insertFile } from './db.js'

let client = null
let connected = false

const session = new StringSession('')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve))
}

export function isConnected() {
  return connected
}

export function getTelegramClient() {
  return client
}

export async function initTelegram() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID)
  const apiHash = process.env.TELEGRAM_API_HASH

  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID и TELEGRAM_API_HASH должны быть в .env')
  }

  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3
  })

  await client.start({
    phoneNumber: async () => await ask('📱 Номер телефона: '),
    password: async () => await ask('🔑 Пароль 2FA (если есть): '),
    phoneCode: async () => await ask('📩 Код из Telegram: '),
    onError: (err) => console.error('Telegram ошибка:', err)
  })

  console.log('✅ Подключено к Telegram как', client.session?.serverAddress)
  connected = true

  // Индексация файлов из сохранённых сообщений
  await indexSavedMessages()

  return client
}

async function indexSavedMessages() {
  console.log('📂 Индексация сохранённых сообщений...')
  clearDatabase()

  try {
    const dialogs = await client.getDialogs({ limit: 10 })
    const saved = dialogs.find(d => d.isUser && d.entity?.self)

    if (saved) {
      insertFolder('saved', '📥 Сохранённые сообщения')
    }

    for (const dialog of dialogs) {
      if (dialog.isUser) continue

      const folderId = `chat_${dialog.id}`
      insertFolder(folderId, dialog.name || dialog.title || `Чат ${dialog.id}`)

      const messages = await client.getMessages(dialog.entity, { limit: 50 })

      for (const msg of messages) {
        if (msg.media) {
          const fileId = `file_${msg.id}`
          const size = msg.media?.document?.size || msg.media?.photo?.sizes?.slice(-1)[0]?.size || 0
          const mimeType = msg.media?.document?.mimeType || 'unknown'
          const fileName = msg.media?.document?.attributes?.find(a => a.fileName)?.fileName || `file_${msg.id}`

          insertFile(fileId, fileName, folderId, size, mimeType, msg.id, dialog.id)
        }
      }
    }

    console.log('✅ Индексация завершена')
  } catch (err) {
    console.error('❌ Ошибка индексации:', err.message)
  }
}
