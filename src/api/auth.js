import { apiRequest } from './client.js'

export async function register({ email, password }) {
  const res = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (res) {
    localStorage.setItem('nodio_token', res.apiToken)
    localStorage.setItem('nodio_salt', res.argon2Salt)
    localStorage.setItem('nodio_userId', res.userId)
    localStorage.setItem('nodio_email', email)
    return res
  }

  return null
}

export async function login({ email, password }) {
  const res = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (res) {
    localStorage.setItem('nodio_token', res.apiToken)
    localStorage.setItem('nodio_salt', res.argon2Salt)
    localStorage.setItem('nodio_userId', res.userId)
    localStorage.setItem('nodio_email', res.email || email)
    return res
  }

  return null
}

export function me() {
  return apiRequest('/auth/me')
}
