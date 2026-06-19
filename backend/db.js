import Database from 'better-sqlite3'
import path from 'path'

let db

export function initDatabase() {
  const dbPath = process.env.DB_PATH || './ftpgram.db'
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_id TEXT,
      size INTEGER DEFAULT 0,
      mime_type TEXT,
      telegram_message_id INTEGER,
      telegram_chat_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
  `)

  console.log('✅ Таблицы созданы')
  return db
}

export function getDatabase() {
  return db
}

export function getFileTree(parentPath = '/') {
  const folders = db.prepare(`
    SELECT id, name, 'folder' as type, NULL as size
    FROM folders
    WHERE parent_id IS NULL
    ORDER BY name
  `).all()

  const files = db.prepare(`
    SELECT id, name, 'file' as type, size
    FROM files
    WHERE folder_id IS NULL
    ORDER BY name
  `).all()

  return [...folders, ...files]
}

export function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
    || db.prepare('SELECT * FROM folders WHERE id = ?').get(id)
}

export function insertFolder(id, name, parentId = null) {
  return db.prepare(`
    INSERT OR REPLACE INTO folders (id, name, parent_id)
    VALUES (?, ?, ?)
  `).run(id, name, parentId)
}

export function insertFile(id, name, folderId = null, size = 0, mimeType = null, msgId = null, chatId = null) {
  return db.prepare(`
    INSERT OR REPLACE INTO files (id, name, folder_id, size, mime_type, telegram_message_id, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, folderId, size, mimeType, msgId, chatId)
}

export function clearDatabase() {
  db.exec('DELETE FROM files; DELETE FROM folders;')
}
