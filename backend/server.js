import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import {
  initDatabase,
  getDatabase,
  getFileTree,
  getFileById,
  getAllFolders,
  getFolderTelegramMessageIds,
  createFolder,
  deleteFile,
  deleteFolder,
  moveFile,
  moveFolder,
  renameFile,
  renameFolder
} from './db.js'
import { sendCode, signIn, isConnected, disconnect, autoConnect, reindex, deleteStorageMessages } from './telegram.js'

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

app.get('/api/folders', (req, res) => {
  res.json(getAllFolders())
})

app.post('/api/folders', (req, res) => {
  try {
    const { name, parentId = null } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })
    res.status(201).json(createFolder(name, parentId))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/folders/:id', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название папки обязательно' })
  renameFolder(req.params.id, name)
  res.json(getFileById(req.params.id))
})

app.delete('/api/folders/:id', async (req, res) => {
  try {
    const messageIds = getFolderTelegramMessageIds(req.params.id)
    await deleteStorageMessages(messageIds)
    deleteFolder(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/files/:id', (req, res) => {
  const { name } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Название файла обязательно' })
  renameFile(req.params.id, name)
  res.json(getFileById(req.params.id))
})

app.delete('/api/files/:id', async (req, res) => {
  try {
    const file = getFileById(req.params.id)
    if (!file) return res.status(404).json({ error: 'Файл не найден' })
    await deleteStorageMessages([file.telegram_message_id])
    deleteFile(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/move', (req, res) => {
  const { id, type, folderId = null } = req.body
  if (!id || !type) return res.status(400).json({ error: 'id и type обязательны' })

  if (type === 'folder') moveFolder(id, folderId)
  else if (type === 'file') moveFile(id, folderId)
  else return res.status(400).json({ error: 'Неизвестный тип элемента' })

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
