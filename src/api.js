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

export function downloadItem(id) {
  const link = document.createElement('a')
  link.href = `${API_URL}/api/files/${encodeURIComponent(id)}/download`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function uploadFile(file, folderId = null, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_URL}/api/files/upload`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    if (folderId) xhr.setRequestHeader('X-Folder-Id', folderId)

    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })

    xhr.addEventListener('load', () => {
      let data = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        reject(new Error(`Загрузка: ${xhr.status}`))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || `Загрузка: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Не удалось загрузить файл')))
    xhr.send(file)
  })
}
