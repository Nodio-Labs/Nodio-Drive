import { createContext, useContext, useMemo, useState } from 'react'

const TOKEN_KEY = 'nodio_token'
const SALT_KEY = 'nodio_salt'
const USER_ID_KEY = 'nodio_userId'
const EMAIL_KEY = 'nodio_email'

const AuthContext = createContext(null)

function getStoredSession() {
  return {
    apiToken: localStorage.getItem(TOKEN_KEY) || '',
    argon2Salt: localStorage.getItem(SALT_KEY) || '',
    userId: localStorage.getItem(USER_ID_KEY) || '',
    email: localStorage.getItem(EMAIL_KEY) || '',
  }
}

export function AuthProvider({ children }) {
  const [session, setSessionState] = useState(getStoredSession)
  const [masterKey, setMasterKey] = useState(null)

  const setSession = ({ apiToken, argon2Salt, userId, email }) => {
    localStorage.setItem(TOKEN_KEY, apiToken)
    localStorage.setItem(SALT_KEY, argon2Salt)
    localStorage.setItem(USER_ID_KEY, userId)
    localStorage.setItem(EMAIL_KEY, email)

    setSessionState({ apiToken, argon2Salt, userId, email })
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(SALT_KEY)
    localStorage.removeItem(USER_ID_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setMasterKey(null)
    setSessionState({ apiToken: '', argon2Salt: '', userId: '', email: '' })
  }

  const value = useMemo(
    () => ({ ...session, masterKey, setMasterKey, setSession, logout }),
    [session, masterKey],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
