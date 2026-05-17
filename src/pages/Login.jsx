import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { login } from '../api/auth.js'
import { useAuth } from '../context/AuthContext.jsx'
import { deriveMasterKey } from '../crypto/argon2.js'

export default function Login() {
  const navigate = useNavigate()
  const { setSession, setMasterKey } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email and password are required')
      setLoading(false)
      return
    }

    try {
      const response = await login({ email: trimmedEmail, password: trimmedPassword })
      const masterKey = await deriveMasterKey(trimmedPassword, response.argon2Salt)

      setSession({
        apiToken: response.apiToken,
        argon2Salt: response.argon2Salt,
        userId: response.userId,
        email: response.email,
      })
      setMasterKey(masterKey)
      navigate('/drive')
    } catch (submitError) {
      setError(submitError.message || 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Nodio</h1>
        <p className="auth-subtitle">Sign in to your drive</p>
        <form className="stack gap-12" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="text"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="auth-link-row">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </section>
    </main>
  )
}
