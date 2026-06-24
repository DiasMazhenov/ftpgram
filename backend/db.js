import Database from 'better-sqlite3'
import crypto from 'crypto'

let db
export const SAVED_MESSAGES_FOLDER_ID = 'telegram_saved_messages'
export const STORAGE_FOLDER_ID = 'telegram_storage'
export const TRASH_FOLDER_ID = 'virtual_trash'
const SYSTEM_FOLDER_IDS = new Set([SAVED_MESSAGES_FOLDER_ID, STORAGE_FOLDER_ID, TRASH_FOLDER_ID])

export function initDatabase() {
  const dbPath = process.env.DB_PATH || './ftpgram.db'
  db = new Database(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      modified_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      trash_batch TEXT
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
      deleted_at TEXT,
      trash_batch TEXT,
      FOREIGN KEY (folder_id) REFERENCES folders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
    CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      item_type TEXT,
      item_id TEXT,
      item_name TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

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
  if (!fileColumns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE files ADD COLUMN deleted_at TEXT')
  }
  if (!fileColumns.some(column => column.name === 'trash_batch')) {
    db.exec('ALTER TABLE files ADD COLUMN trash_batch TEXT')
  }

  const folderColumns = db.prepare('PRAGMA table_info(folders)').all()
  if (!folderColumns.some(column => column.name === 'modified_at')) {
    db.exec("ALTER TABLE folders ADD COLUMN modified_at TEXT; UPDATE folders SET modified_at = datetime('now')")
  }
  if (!folderColumns.some(column => column.name === 'deleted_at')) {
    db.exec('ALTER TABLE folders ADD COLUMN deleted_at TEXT')
  }
  if (!folderColumns.some(column => column.name === 'trash_batch')) {
    db.exec('ALTER TABLE folders ADD COLUMN trash_batch TEXT')
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

export function logAudit(action, {
  itemType = null,
  itemId = null,
  itemName = null,
  details = null
} = {}) {
  const id = `audit_${crypto.randomUUID()}`
  db.prepare(`
    INSERT INTO audit_logs (id, action, item_type, item_id, item_name, details)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    action,
    itemType,
    itemId,
    itemName,
    details ? JSON.stringify(details) : null
  )
  return id
}

export function getAuditLogs(limit = 20) {
  return db.prepare(`
    SELECT id, action, item_type, item_id, item_name, details, created_at
    FROM audit_logs
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(Number(limit) || 20, 100))).map(entry => ({
    ...entry,
    details: entry.details ? JSON.parse(entry.details) : null
  }))
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
      FROM folders WHERE parent_id = ? AND deleted_at IS NULL
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
      FROM files WHERE folder_id = ? AND deleted_at IS NULL
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
    FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL
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
    FROM files WHERE folder_id IS NULL AND deleted_at IS NULL
    ORDER BY name
  `).all()

  return [
    ...folders,
    ...files
  ]
}

export function getFileById(id) {
  return db.prepare('SELECT * FROM files WHERE id = ?').get(id)
    || db.prepare('SELECT * FROM folders WHERE id = ?').get(id)
}

export function getAllFolders() {
  return db.prepare(`
    SELECT id, name, parent_id
    FROM folders
    WHERE deleted_at IS NULL
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
  if (parentId) {
    const descendant = db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ?
        UNION ALL
        SELECT folders.id
        FROM folders
        JOIN descendants ON folders.parent_id = descendants.id
      )
      SELECT id FROM descendants WHERE id = ?
    `).get(id, parentId)
    if (descendant) throw new Error('Папку нельзя переместить внутрь своей вложенной папки')
  }
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

export function trashFile(id) {
  const batch = `trash_${crypto.randomUUID()}`
  return db.prepare(`
    UPDATE files
    SET deleted_at = datetime('now'), trash_batch = ?, modified_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(batch, id)
}

export function trashFolder(id) {
  if (SYSTEM_FOLDER_IDS.has(id)) throw new Error('Системную папку нельзя удалить')
  const batch = `trash_${crypto.randomUUID()}`
  const transaction = db.transaction(() => {
    db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ?
        UNION ALL
        SELECT folders.id
        FROM folders
        JOIN descendants ON folders.parent_id = descendants.id
      )
      UPDATE files
      SET deleted_at = datetime('now'), trash_batch = ?, modified_at = datetime('now')
      WHERE folder_id IN (SELECT id FROM descendants)
    `).run(id, batch)

    return db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ?
        UNION ALL
        SELECT folders.id
        FROM folders
        JOIN descendants ON folders.parent_id = descendants.id
      )
      UPDATE folders
      SET deleted_at = datetime('now'), trash_batch = ?, modified_at = datetime('now')
      WHERE id IN (SELECT id FROM descendants)
    `).run(id, batch)
  })
  return transaction()
}

export function getTrashItems(olderThan = null) {
  const ageFilter = olderThan ? 'AND datetime(item.deleted_at) <= datetime(?)' : ''
  const params = olderThan ? [olderThan, olderThan] : []
  return db.prepare(`
    SELECT * FROM (
      SELECT
        item.id,
        item.name,
        'folder' as type,
        (
          SELECT COALESCE(SUM(files.size), 0)
          FROM files
          WHERE files.trash_batch = item.trash_batch
        ) as size,
        'folder' as mime_type,
        item.created_at as date_added,
        item.modified_at as date_modified,
        item.created_at as date_created,
        item.deleted_at
      FROM folders item
      LEFT JOIN folders parent ON parent.id = item.parent_id
      WHERE item.deleted_at IS NOT NULL
        AND (parent.id IS NULL OR parent.deleted_at IS NULL OR parent.trash_batch != item.trash_batch)
        ${ageFilter}

      UNION ALL

      SELECT
        item.id,
        item.name,
        'file' as type,
        item.size,
        item.mime_type,
        item.created_at as date_added,
        item.modified_at as date_modified,
        COALESCE(item.source_created_at, item.created_at) as date_created,
        item.deleted_at
      FROM files item
      LEFT JOIN folders parent ON parent.id = item.folder_id
      WHERE item.deleted_at IS NOT NULL
        AND (parent.id IS NULL OR parent.deleted_at IS NULL OR parent.trash_batch != item.trash_batch)
        ${ageFilter}
    )
    ORDER BY deleted_at DESC
  `).all(...params)
}

export function restoreTrashItem(type, id) {
  const table = type === 'folder' ? 'folders' : 'files'
  const item = db.prepare(`SELECT trash_batch FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).get(id)
  if (!item) throw new Error('Элемент не найден в корзине')

  if (type === 'file') {
    return db.prepare(`
      UPDATE files
      SET deleted_at = NULL, trash_batch = NULL, modified_at = datetime('now')
      WHERE id = ?
    `).run(id)
  }

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE files
      SET deleted_at = NULL, trash_batch = NULL, modified_at = datetime('now')
      WHERE trash_batch = ?
    `).run(item.trash_batch)
    return db.prepare(`
      UPDATE folders
      SET deleted_at = NULL, trash_batch = NULL, modified_at = datetime('now')
      WHERE trash_batch = ?
    `).run(item.trash_batch)
  })
  return transaction()
}

export function getTrashFiles(type, id) {
  if (type === 'file') {
    const file = db.prepare('SELECT * FROM files WHERE id = ? AND deleted_at IS NOT NULL').get(id)
    return file ? [file] : []
  }
  const folder = db.prepare('SELECT trash_batch FROM folders WHERE id = ? AND deleted_at IS NOT NULL').get(id)
  if (!folder) return []
  return db.prepare('SELECT * FROM files WHERE trash_batch = ?').all(folder.trash_batch)
}

export function permanentlyDeleteTrashItem(type, id) {
  const table = type === 'folder' ? 'folders' : 'files'
  const item = db.prepare(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).get(id)
  if (!item) throw new Error('Элемент не найден в корзине')

  if (type === 'file') return deleteFile(id)
  return deleteFolder(id)
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
      name = excluded.name,
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

export function deleteIndexedFilesByMessageIds(messageIds, { chatId = null, source = null } = {}) {
  if (!messageIds.length) return { changes: 0 }
  const placeholders = messageIds.map(() => '?').join(', ')
  const chatFilter = chatId ? 'AND telegram_chat_id = ?' : ''
  const sourceFilter = source ? 'AND telegram_source = ?' : ''
  const params = [...messageIds]
  if (chatId) params.push(chatId)
  if (source) params.push(source)
  return db.prepare(`
    DELETE FROM files
    WHERE telegram_message_id IN (${placeholders})
      ${chatFilter}
      ${sourceFilter}
  `).run(...params)
}

export function removeMissingIndexedFiles(source, messageIds) {
  if (!messageIds.length) {
    return { changes: 0 }
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
