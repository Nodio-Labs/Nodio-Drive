import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

export default function MasterPasswordPromptModal({
  open,
  onSubmit,
  error,
  isLoading,
  title = 'Enter Master Password',
  message = 'Your master password is needed to access your encrypted files.',
}) {
  const [password, setPassword] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password.trim()) {
      onSubmit(password)
      setPassword('')
    }
  }

  const handleCancel = () => {
    setPassword('')
  }

  if (!open) {
    return null
  }

  return (
    <div className="overlay" style={{ zIndex: 9999 }}>
      <section className="modal" style={{ maxWidth: '400px' }}>
        <header className="modal-header">
          <h3>{title}</h3>
        </header>
        <p className="modal-copy">{message}</p>
        <form onSubmit={handleSubmit} className="stack gap-12">
          <input
            className="auth-input"
            type="password"
            value={password}
            placeholder="Master password"
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
            required
          />
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isLoading || !password.trim()}>
              {isLoading ? 'Unlocking...' : 'Unlock Drive'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
