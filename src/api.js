const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'])

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

export async function fetchTrash() {
  const res = await fetch(`${API_URL}/api/trash`)
  if (!res.ok) throw new Error(`Корзина: ${res.status}`)
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

export function restoreItem(type, id) {
  return request(`/api/trash/${type}/${id}/restore`, { method: 'POST' })
}

export function deleteForever(type, id) {
  return request(`/api/trash/${type}/${id}`, { method: 'DELETE' })
}

export function emptyTrash() {
  return request('/api/trash', { method: 'DELETE' })
}

export function moveItem(type, id, folderId = null) {
  return request('/api/move', {
    method: 'POST',
    body: JSON.stringify({ type, id, folderId })
  })
}

export function setProtocolEnabled(name, enabled) {
  return request(`/api/protocols/${name}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  })
}

export function downloadItem(id) {
  const link = document.createElement('a')
  link.href = getFileUrl(id)
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function getFileUrl(id, inline = false) {
  return `${API_URL}/api/files/${encodeURIComponent(id)}/download${inline ? '?inline=1' : ''}`
}

export function isOfficeFile(file) {
  const extension = file?.name?.split('.').pop()?.toLowerCase()
  return OFFICE_EXTENSIONS.has(extension)
}

export async function openInGoogleDocs(id) {
  const viewerWindow = window.open('about:blank', '_blank')
  if (!viewerWindow) throw new Error('Браузер заблокировал новое окно')
  viewerWindow.opener = null

  try {
    const data = await request(`/api/files/${encodeURIComponent(id)}/google-docs`)
    viewerWindow.location.replace(data.url)
  } catch (error) {
    viewerWindow.close()
    throw error
  }
}

export function uploadFile(file, folderId = null, onProgress = () => {}, signal = null) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    const rejectOnce = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    const resolveOnce = (data) => {
      if (settled) return
      settled = true
      resolve(data)
    }
    const abortUpload = () => {
      xhr.abort()
      rejectOnce(new DOMException('Загрузка отменена', 'AbortError'))
    }
    if (signal?.aborted) {
      abortUpload()
      return
    }
    signal?.addEventListener('abort', abortUpload, { once: true })

    xhr.open('POST', `${API_URL}/api/files/upload`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    if (folderId) xhr.setRequestHeader('X-Folder-Id', folderId)

    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })

    xhr.addEventListener('load', () => {
      signal?.removeEventListener('abort', abortUpload)
      let data = {}
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        rejectOnce(new Error(`Загрузка: ${xhr.status}`))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) resolveOnce(data)
      else rejectOnce(new Error(data.error || `Загрузка: ${xhr.status}`))
    })
    xhr.addEventListener('error', () => {
      signal?.removeEventListener('abort', abortUpload)
      rejectOnce(new Error('Не удалось загрузить файл'))
    })
    xhr.addEventListener('abort', () => {
      signal?.removeEventListener('abort', abortUpload)
      rejectOnce(new DOMException('Загрузка отменена', 'AbortError'))
    })
    xhr.send(file)
  })
}
