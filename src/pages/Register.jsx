import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { register } from '../api/auth.js'
import { useAuth } from '../context/AuthContext.jsx'
import { deriveMasterKey } from '../crypto/argon2.js'

export default function Register() {
  const navigate = useNavigate()
  const { setSession, setMasterKey } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showWarning, setShowWarning] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await register({ email, password })
      const masterKey = await deriveMasterKey(password, response.argon2Salt)

      setSession({
        apiToken: response.apiToken,
        argon2Salt: response.argon2Salt,
        userId: response.userId,
        email,
      })
      setMasterKey(masterKey)
      setShowWarning(true)
    } catch (submitError) {
      setError(submitError.message || 'Unable to register')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Nodio</h1>
        <p className="auth-subtitle">Create your encrypted drive</p>
        <form className="stack gap-12" onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="email"
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
          <input
            className="auth-input"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" disabled={loading}>
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <p className="auth-link-row">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </section>

      {showWarning && (
        <div className="overlay">
          <section className="modal">
            <h3>Important</h3>
            <p className="modal-copy">
              Your files are encrypted with your password. If you forget your password, your files
              cannot be recovered by anyone, not even us.
            </p>
            <button type="button" className="primary-button" onClick={() => navigate('/drive')}>
              I understand
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
