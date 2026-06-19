import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDatabase, getFileTree, getFileById } from './db.js'
import { initTelegram, getTelegramClient, isConnected } from './telegram.js'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

// ========== Telegram Status ==========
app.get('/api/status', (req, res) => {
  res.json({
    connected: isConnected(),
    timestamp: new Date().toISOString()
  })
})

// ========== Подключение к Telegram ==========
app.post('/api/connect', async (req, res) => {
  try {
    await initTelegram()
    res.json({ success: true, message: 'Подключено к Telegram' })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// ========== Файловая структура ==========
app.get('/api/files', (req, res) => {
  const path = req.query.path || '/'
  const files = getFileTree(path)
  res.json(files)
})

// ========== Информация о файле ==========
app.get('/api/files/:id', (req, res) => {
  const file = getFileById(req.params.id)
  if (!file) return res.status(404).json({ error: 'Файл не найден' })
  res.json(file)
})

// ========== Статистика ==========
app.get('/api/stats', (req, res) => {
  const db = getDatabase()
  const stats = {
    files: db.prepare('SELECT COUNT(*) as count FROM files').get().count,
    folders: db.prepare('SELECT COUNT(*) as count FROM folders').get().count,
    totalSize: db.prepare('SELECT SUM(size) as total FROM files').get().total || 0
  }
  res.json(stats)
})

// ========== Запуск ==========
async function start() {
  initDatabase()
  console.log('📦 SQLite база готова')

  app.listen(PORT, () => {
    console.log(`🚀 FTPgram Backend запущен на http://localhost:${PORT}`)
    console.log('⏳ Ожидание ключей Telegram в .env...')
  })
}

start()
