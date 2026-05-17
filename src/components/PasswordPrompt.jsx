import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

export default function PasswordPrompt({ onUnlock, onCancel, error, message, title = 'Unlock your drive', isLoading = false }) {
  const [password, setPassword] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    onUnlock(password)
  }

  return (
    <div className="overlay">
      <section className="modal">
        <header className="modal-header">
          <h3>{title}</h3>
        </header>
        <p className="modal-copy">{message || 'Enter your password to derive your encryption key.'}</p>
        <form onSubmit={handleSubmit} className="stack gap-12">
          <input
            className="auth-input"
            type="password"
            value={password}
            placeholder="Password"
            onChange={(event) => setPassword(event.target.value)}
            disabled={isLoading}
            required
          />
          {error && (
            <div className="auth-error-box">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
          <div className="modal-actions">
            {onCancel && (
              <button type="button" className="secondary-button" onClick={onCancel} disabled={isLoading}>
                Cancel
              </button>
            )}
            <button type="submit" className="primary-button" disabled={isLoading}>
              {isLoading ? 'Processing...' : 'Continue'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
