import { useState, useCallback } from 'react'

/**
 * Hook to manage master password in session memory only
 * Never stored in localStorage or sent to server
 * Prompts again on page refresh/exit
 */
export function useMasterPassword() {
  const [masterPassword, setMasterPassword] = useState(null)
  const [masterPasswordError, setMasterPasswordError] = useState('')
  const [showMasterPasswordPrompt, setShowMasterPasswordPrompt] = useState(false)

  const setMasterPasswordFromInput = useCallback((password) => {
    if (password && password.trim()) {
      setMasterPassword(password)
      setShowMasterPasswordPrompt(false)
      setMasterPasswordError('')
    } else {
      setMasterPasswordError('Master password is required')
    }
  }, [])

  const clearMasterPassword = useCallback(() => {
    setMasterPassword(null)
  }, [])

  const requestMasterPassword = useCallback(() => {
    setShowMasterPasswordPrompt(true)
    setMasterPasswordError('')
  }, [])

  return {
    masterPassword,
    masterPasswordError,
    showMasterPasswordPrompt,
    setMasterPasswordFromInput,
    clearMasterPassword,
    requestMasterPassword,
    setShowMasterPasswordPrompt,
    setMasterPasswordError,
  }
}
