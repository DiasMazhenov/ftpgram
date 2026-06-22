import Database from 'better-sqlite3'
import crypto from 'crypto'

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

    DELETE FROM files
    WHERE folder_id IN (SELECT id FROM folders WHERE id LIKE 'chat_%');

    DELETE FROM folders
    WHERE id LIKE 'chat_%';
  `)

  console.log('✅ Таблицы созданы')
  return db
}

export function getDatabase() {
  return db
}

export function getFileTree(folderId = null) {
  if (folderId) {
    const folders = db.prepare(`
      SELECT id, name, 'folder' as type, NULL as size
      FROM folders WHERE parent_id = ?
      ORDER BY name
    `).all(folderId)

    const files = db.prepare(`
      SELECT id, name, 'file' as type, size
      FROM files WHERE folder_id = ?
      ORDER BY name
    `).all(folderId)

    return [...folders, ...files]
  }

  const folders = db.prepare(`
    SELECT id, name, 'folder' as type, NULL as size
    FROM folders WHERE parent_id IS NULL
    ORDER BY name
  `).all()

  const files = db.prepare(`
    SELECT id, name, 'file' as type, size
    FROM files WHERE folder_id IS NULL
    ORDER BY name
  `).all()

  return [...folders, ...files]
}

export function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
    || db.prepare('SELECT * FROM folders WHERE id = ?').get(id)
}

export function getAllFolders() {
  return db.prepare(`
    SELECT id, name, parent_id
    FROM folders
    ORDER BY name
  `).all()
}

export function insertFolder(id, name, parentId = null) {
  return db.prepare(`
    INSERT OR REPLACE INTO folders (id, name, parent_id)
    VALUES (?, ?, ?)
  `).run(id, name, parentId)
}

export function createFolder(name, parentId = null) {
  const id = `folder_${crypto.randomUUID()}`
  insertFolder(id, name.trim(), parentId)
  return getFileById(id)
}

export function renameFolder(id, name) {
  return db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), id)
}

export function renameFile(id, name) {
  return db.prepare('UPDATE files SET name = ? WHERE id = ?').run(name.trim(), id)
}

export function moveFolder(id, parentId = null) {
  if (id === parentId) throw new Error('Папку нельзя переместить внутрь самой себя')
  return db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parentId, id)
}

export function moveFile(id, folderId = null) {
  return db.prepare('UPDATE files SET folder_id = ? WHERE id = ?').run(folderId, id)
}

export function deleteFolder(id) {
  const childFolders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id)
  for (const folder of childFolders) deleteFolder(folder.id)

  db.prepare('DELETE FROM files WHERE folder_id = ?').run(id)
  return db.prepare('DELETE FROM folders WHERE id = ?').run(id)
}

export function deleteFile(id) {
  return db.prepare('DELETE FROM files WHERE id = ?').run(id)
}

export function getFolderTelegramMessageIds(id) {
  return db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION ALL
      SELECT folders.id
      FROM folders
      JOIN descendants ON folders.parent_id = descendants.id
    )
    SELECT telegram_message_id
    FROM files
    WHERE folder_id IN (SELECT id FROM descendants)
      AND telegram_message_id IS NOT NULL
  `).all(id).map(row => row.telegram_message_id)
}

export function insertFile(id, name, folderId = null, size = 0, mimeType = null, msgId = null, chatId = null) {
  return db.prepare(`
    INSERT OR REPLACE INTO files (id, name, folder_id, size, mime_type, telegram_message_id, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, folderId, size, mimeType, msgId, chatId)
}

export function upsertIndexedFile(id, name, size = 0, mimeType = null, msgId = null, chatId = null) {
  return db.prepare(`
    INSERT INTO files (id, name, folder_id, size, mime_type, telegram_message_id, telegram_chat_id)
    VALUES (?, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      size = excluded.size,
      mime_type = excluded.mime_type,
      telegram_message_id = excluded.telegram_message_id,
      telegram_chat_id = excluded.telegram_chat_id
  `).run(id, name, size, mimeType, msgId, chatId)
}

export function clearDatabase() {
  db.exec('DELETE FROM files; DELETE FROM folders;')
}

export function cleanupLegacyChatFolders() {
  db.exec(`
    DELETE FROM files
    WHERE folder_id IN (SELECT id FROM folders WHERE id LIKE 'chat_%');

    DELETE FROM folders
    WHERE id LIKE 'chat_%';
  `)
}
