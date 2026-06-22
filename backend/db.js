import Database from 'better-sqlite3'
import crypto from 'crypto'

let db
export const SAVED_MESSAGES_FOLDER_ID = 'telegram_saved_messages'
export const STORAGE_FOLDER_ID = 'telegram_storage'
const SYSTEM_FOLDER_IDS = new Set([SAVED_MESSAGES_FOLDER_ID, STORAGE_FOLDER_ID])

export function initDatabase() {
  const dbPath = process.env.DB_PATH || './ftpgram.db'
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      modified_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_id TEXT,
      size INTEGER DEFAULT 0,
      mime_type TEXT,
      telegram_message_id INTEGER,
      telegram_chat_id INTEGER,
      telegram_source TEXT DEFAULT 'storage',
      created_at TEXT DEFAULT (datetime('now')),
      modified_at TEXT DEFAULT (datetime('now')),
      source_created_at TEXT,
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

    DELETE FROM files
    WHERE folder_id IN (SELECT id FROM folders WHERE id LIKE 'chat_%');

    DELETE FROM folders
    WHERE id LIKE 'chat_%';
  `)

  const fileColumns = db.prepare('PRAGMA table_info(files)').all()
  if (!fileColumns.some(column => column.name === 'telegram_source')) {
    db.exec("ALTER TABLE files ADD COLUMN telegram_source TEXT DEFAULT 'storage'")
  }
  if (!fileColumns.some(column => column.name === 'modified_at')) {
    db.exec("ALTER TABLE files ADD COLUMN modified_at TEXT; UPDATE files SET modified_at = datetime('now')")
  }
  if (!fileColumns.some(column => column.name === 'source_created_at')) {
    db.exec('ALTER TABLE files ADD COLUMN source_created_at TEXT')
  }

  const folderColumns = db.prepare('PRAGMA table_info(folders)').all()
  if (!folderColumns.some(column => column.name === 'modified_at')) {
    db.exec("ALTER TABLE folders ADD COLUMN modified_at TEXT; UPDATE folders SET modified_at = datetime('now')")
  }

  db.prepare(`
    INSERT INTO folders (id, name, parent_id)
    VALUES (?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = NULL
  `).run(SAVED_MESSAGES_FOLDER_ID, 'Избранное')
  db.prepare(`
    INSERT INTO folders (id, name, parent_id)
    VALUES (?, ?, NULL)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = NULL
  `).run(STORAGE_FOLDER_ID, 'FTPgram Storage')

  db.prepare(`
    UPDATE files
    SET folder_id = ?
    WHERE telegram_source = 'storage' AND folder_id IS NULL
  `).run(STORAGE_FOLDER_ID)

  console.log('✅ Таблицы созданы')
  return db
}

export function getDatabase() {
  return db
}

export function getFileTree(folderId = null) {
  if (folderId) {
    const folders = db.prepare(`
      SELECT
        id,
        name,
        'folder' as type,
        NULL as size,
        'folder' as mime_type,
        created_at as date_added,
        modified_at as date_modified,
        created_at as date_created
      FROM folders WHERE parent_id = ?
      ORDER BY name
    `).all(folderId)

    const files = db.prepare(`
      SELECT
        id,
        name,
        'file' as type,
        size,
        mime_type,
        created_at as date_added,
        modified_at as date_modified,
        COALESCE(source_created_at, created_at) as date_created
      FROM files WHERE folder_id = ?
      ORDER BY name
    `).all(folderId)

    return [...folders, ...files]
  }

  const folders = db.prepare(`
    SELECT
      id,
      name,
      'folder' as type,
      NULL as size,
      'folder' as mime_type,
      created_at as date_added,
      modified_at as date_modified,
      created_at as date_created
    FROM folders WHERE parent_id IS NULL
    ORDER BY name
  `).all()

  const files = db.prepare(`
    SELECT
      id,
      name,
      'file' as type,
      size,
      mime_type,
      created_at as date_added,
      modified_at as date_modified,
      COALESCE(source_created_at, created_at) as date_created
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
    INSERT INTO folders (id, name, parent_id)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      parent_id = excluded.parent_id,
      modified_at = datetime('now')
  `).run(id, name, parentId)
}

export function createFolder(name, parentId = null) {
  const id = `folder_${crypto.randomUUID()}`
  insertFolder(id, name.trim(), parentId)
  return getFileById(id)
}

export function renameFolder(id, name) {
  if (SYSTEM_FOLDER_IDS.has(id)) throw new Error('Системную папку нельзя переименовать')
  return db.prepare(`
    UPDATE folders SET name = ?, modified_at = datetime('now') WHERE id = ?
  `).run(name.trim(), id)
}

export function renameFile(id, name) {
  return db.prepare(`
    UPDATE files SET name = ?, modified_at = datetime('now') WHERE id = ?
  `).run(name.trim(), id)
}

export function moveFolder(id, parentId = null) {
  if (SYSTEM_FOLDER_IDS.has(id)) throw new Error('Системную папку нельзя перемещать')
  if (id === parentId) throw new Error('Папку нельзя переместить внутрь самой себя')
  return db.prepare(`
    UPDATE folders SET parent_id = ?, modified_at = datetime('now') WHERE id = ?
  `).run(parentId, id)
}

export function moveFile(id, folderId = null) {
  return db.prepare(`
    UPDATE files SET folder_id = ?, modified_at = datetime('now') WHERE id = ?
  `).run(folderId, id)
}

export function deleteFolder(id) {
  if (SYSTEM_FOLDER_IDS.has(id)) throw new Error('Системную папку нельзя удалить')
  const childFolders = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id)
  for (const folder of childFolders) deleteFolder(folder.id)

  db.prepare('DELETE FROM files WHERE folder_id = ?').run(id)
  return db.prepare('DELETE FROM folders WHERE id = ?').run(id)
}

export function deleteFile(id) {
  return db.prepare('DELETE FROM files WHERE id = ?').run(id)
}

export function getFolderFiles(id) {
  return db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION ALL
      SELECT folders.id
      FROM folders
      JOIN descendants ON folders.parent_id = descendants.id
    )
    SELECT *
    FROM files
    WHERE folder_id IN (SELECT id FROM descendants)
      AND telegram_message_id IS NOT NULL
  `).all(id)
}

export function insertFile(
  id,
  name,
  folderId = null,
  size = 0,
  mimeType = null,
  msgId = null,
  chatId = null,
  source = 'storage',
  sourceCreatedAt = null
) {
  return db.prepare(`
    INSERT OR REPLACE INTO files (
      id, name, folder_id, size, mime_type, telegram_message_id, telegram_chat_id,
      telegram_source, source_created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, folderId, size, mimeType, msgId, chatId, source, sourceCreatedAt)
}

export function upsertIndexedFile(
  id,
  name,
  size = 0,
  mimeType = null,
  msgId = null,
  chatId = null,
  folderId = null,
  source = 'storage',
  sourceCreatedAt = null,
  sourceModifiedAt = null
) {
  return db.prepare(`
    INSERT INTO files (
      id, name, folder_id, size, mime_type, telegram_message_id, telegram_chat_id,
      telegram_source, source_created_at, modified_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
    ON CONFLICT(id) DO UPDATE SET
      size = excluded.size,
      mime_type = excluded.mime_type,
      telegram_message_id = excluded.telegram_message_id,
      telegram_chat_id = excluded.telegram_chat_id,
      telegram_source = excluded.telegram_source,
      source_created_at = COALESCE(files.source_created_at, excluded.source_created_at),
      modified_at = CASE
        WHEN datetime(excluded.modified_at) > datetime(files.modified_at) THEN excluded.modified_at
        ELSE files.modified_at
      END
  `).run(
    id,
    name,
    folderId,
    size,
    mimeType,
    msgId,
    chatId,
    source,
    sourceCreatedAt,
    sourceModifiedAt
  )
}

export function removeMissingIndexedFiles(source, messageIds) {
  if (!messageIds.length) {
    return db.prepare('DELETE FROM files WHERE telegram_source = ?').run(source)
  }

  const placeholders = messageIds.map(() => '?').join(', ')
  return db.prepare(`
    DELETE FROM files
    WHERE telegram_source = ?
      AND telegram_message_id NOT IN (${placeholders})
  `).run(source, ...messageIds)
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
