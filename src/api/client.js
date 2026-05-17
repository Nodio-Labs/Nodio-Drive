export const BASE = '/api'

function statusMessage(status, fallback) {
  switch (status) {
    case 401:
      return 'Unauthorized'
    case 403:
      return 'Access denied'
    case 404:
      return 'Not found'
    case 500:
      return 'Server error, try again'
    default:
      return fallback || 'Request failed'
  }
}

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('nodio_token')

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })
  } catch (err) {
    console.error('Network error', err)
    throw new Error('Cannot connect to server')
  }

  if (res.status === 401) {
    localStorage.clear()
    window.location.href = '/login'
    return
  }

  const text = await res.text().catch(() => '')
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch (err) {
    // non-json response
    data = { message: text }
  }

  if (!res.ok) {
    const msg = data?.message || statusMessage(res.status, null)
    throw new Error(msg)
  }

  return data
}
