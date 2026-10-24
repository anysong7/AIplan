const BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (!res.ok) {
    const message = data?.error?.message || `请求失败 (${res.status})`
    const error = new Error(message)
    error.status = res.status
    error.code = data?.error?.code
    throw error
  }
  return data
}

export const api = {
  status: () => request('/status'),
  hotspots: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
    )
    return request(`/hotspots?${query.toString()}`)
  },
  event: (id) => request(`/events/${id}`),
  watches: () => request('/watches'),
  addWatch: (body) => request('/watches', { method: 'POST', body }),
  updateWatch: (id, body) => request(`/watches/${id}`, { method: 'PATCH', body }),
  removeWatch: (id) => request(`/watches/${id}`, { method: 'DELETE' }),
  topics: () => request('/topics'),
  alerts: (params = {}) => {
    const query = new URLSearchParams(params)
    return request(`/alerts?${query.toString()}`)
  },
  readAlert: (id) => request(`/alerts/${id}/read`, { method: 'POST' }),
  readAll: () => request('/alerts/read-all', { method: 'POST' }),
  scan: (scope = 'all') => request('/scan', { method: 'POST', body: { scope } }),
  job: (id) => request(`/scan/${id}`),
  sources: () => request('/sources'),
  notifications: () => request('/notifications'),
  usage: () => request('/usage'),
  settings: () => request('/settings'),
  saveSettings: (body) => request('/settings', { method: 'PATCH', body }),
  testEmail: () => request('/test/email', { method: 'POST', body: {} }),
  feedback: (body) => request('/feedback', { method: 'POST', body })
}

export function connectStream({ onEvent, onStatus }) {
  const source = new EventSource(`${BASE}/api/stream`)
  const bind = (name) => {
    source.addEventListener(name, (event) => {
      try {
        onEvent(name, JSON.parse(event.data))
      } catch {
        // ignore malformed payload
      }
    })
  }
  ;['hello', 'alert.new', 'item.new', 'scan.progress', 'source.health', 'notification.update', 'ping'].forEach(bind)
  source.onopen = () => onStatus?.('open')
  source.onerror = () => onStatus?.('error')
  return source
}
