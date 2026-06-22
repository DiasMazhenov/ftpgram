const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export async function fetchStatus() {
  const res = await fetch(`${API_URL}/api/status`)
  if (!res.ok) throw new Error(`Статус: ${res.status}`)
  return res.json()
}

export async function fetchStats() {
  const res = await fetch(`${API_URL}/api/stats`)
  if (!res.ok) throw new Error(`Статистика: ${res.status}`)
  return res.json()
}

export async function fetchFiles(folderId = null) {
  const url = folderId
    ? `${API_URL}/api/files?folder=${encodeURIComponent(folderId)}`
    : `${API_URL}/api/files`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Файлы: ${res.status}`)
  return res.json()
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `API: ${res.status}`)
  }
  return res.json()
}

export function createFolder(name, parentId = null) {
  return request('/api/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId })
  })
}

export function fetchFolders() {
  return request('/api/folders')
}

export function renameItem(type, id, name) {
  const path = type === 'folder' ? `/api/folders/${id}` : `/api/files/${id}`
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  })
}

export function deleteItem(type, id) {
  const path = type === 'folder' ? `/api/folders/${id}` : `/api/files/${id}`
  return request(path, { method: 'DELETE' })
}

export function moveItem(type, id, folderId = null) {
  return request('/api/move', {
    method: 'POST',
    body: JSON.stringify({ type, id, folderId })
  })
}
