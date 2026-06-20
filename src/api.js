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

export async function fetchFiles() {
  const res = await fetch(`${API_URL}/api/files`)
  if (!res.ok) throw new Error(`Файлы: ${res.status}`)
  return res.json()
}
