/** Relative paths use Vite dev proxy / nginx in production. Override via env when needed. */
export const API_BASE = import.meta.env.VITE_API_URL ?? ''

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${normalized}`
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('netrika_token')
  const headers = new Headers(init?.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(apiUrl(path), { ...init, headers })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data.error === 'string'
      ? data.error
      : `Request failed (${response.status})`
    throw new Error(message)
  }
  if (data === null) throw new Error('The server returned an invalid response')
  return data as T
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem('netrika_token')
  const response = await fetch(apiUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`)
  }

  const objectUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  link.click()
  URL.revokeObjectURL(objectUrl)
}

export function wsUrl(path: string): string {
  const envBase = import.meta.env.VITE_WS_URL
  const normalized = path.startsWith('/') ? path : `/${path}`
  if (envBase) return `${envBase}${normalized}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalized}`
}
