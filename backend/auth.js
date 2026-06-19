import 'dotenv/config'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import readline from 'readline'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask(q) {
  return new Promise(resolve => rl.question(q, resolve))
}

async function main() {
  const apiId = parseInt(process.env.TELEGRAM_API_ID)
  const apiHash = process.env.TELEGRAM_API_HASH

  if (!apiId || !apiHash) {
    console.error('TELEGRAM_API_ID и TELEGRAM_API_HASH должны быть в .env')
    process.exit(1)
  }

  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3
  })

  await client.start({
    phoneNumber: async () => await ask('📱 Номер телефона: '),
    password: async () => await ask('🔑 Пароль 2FA (Enter если нет): '),
    phoneCode: async () => await ask('📩 Код из Telegram: '),
    onError: (err) => console.error('Ошибка:', err)
  })

  const session = client.session.save()
  console.log('\n✅ Авторизация успешна!')
  console.log('\n📋 Строка сессии для Render:')
  console.log('─'.repeat(50))
  console.log(session)
  console.log('─'.repeat(50))
  console.log('\nСкопируй эту строку и вставь в переменную TELEGRAM_SESSION на Render')

  await client.disconnect()
  rl.close()
  process.exit(0)
}

main()
