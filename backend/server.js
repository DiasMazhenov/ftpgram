import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDatabase, getDatabase, getFileTree, getFileById } from './db.js'
import { sendCode, signIn, isConnected, disconnect, autoConnect, reindex, getTelegramClient } from './telegram.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// Статус
app.get('/api/status', (req, res) => {
  res.json({ connected: isConnected(), timestamp: new Date().toISOString() })
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

// Принудительная переиндексация
app.post('/api/reindex', async (req, res) => {
  try {
    await reindex()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Отладка
app.get('/api/debug', async (req, res) => {
  const client = getTelegramClient()
  if (!client) return res.json({ error: 'Нет подключения' })
  try {
    const { Api } = await import('telegram')
    const dialogs = await client.getDialogs({ limit: 1 })
    const inputPeer = await client.getInputEntity(dialogs[0].entity)
    const result = await client.invoke(
      new Api.messages.GetHistory({ peer: inputPeer, limit: 10, offsetId: 0, addOffset: 0 })
    )
    const sample = result.messages.slice(0, 5).map(m => ({
      id: m?.id,
      msg: m?.message?.substring(0, 50),
      mediaClass: m?.media?.className || 'none'
    }))
    res.json({ dialog: dialogs[0].name, sample })
  } catch (err) {
    res.json({ error: err.message })
  }
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
  const files = db.prepare('SELECT COUNT(*) as count FROM files').get().count
  const folders = db.prepare('SELECT COUNT(*) as count FROM folders').get().count
  const totalSize = db.prepare('SELECT SUM(size) as total FROM files').get().total || 0
  res.json({ files, folders, totalSize })
})

async function start() {
  initDatabase()
  console.log('📦 SQLite база готова')

  // Пробуем авто-подключиться если есть сохранённая сессия
  await autoConnect()

  app.listen(PORT, () => {
    console.log(`🚀 FTPgram Backend: http://localhost:${PORT}`)
  })
}

start()
