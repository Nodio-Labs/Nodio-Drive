import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Profile() {
  const { email, userId, logout } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1>Profile</h1>
        <p className="auth-subtitle">Account details</p>
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8 }}><strong>Email:</strong> {email}</div>
          <div style={{ marginBottom: 16 }}><strong>User ID:</strong> {userId}</div>
          <button type="button" className="primary-button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  )
}
