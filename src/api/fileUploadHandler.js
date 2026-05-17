import { encryptAESKey, deriveMasterKey } from '../crypto/masterKey.js'

const BASE_URL = '/api'

/**
 * Handle post-upload key storage
 * If user is logged in, prompts for master password and stores encrypted key
 * If not logged in, returns the raw AES key for display
 * @param {string} fileId - The file ID
 * @param {Uint8Array} aesKey - The AES key (32 bytes)
 * @param {string} authToken - Optional auth token (if logged in)
 * @param {string} argon2Salt - Optional salt from session
 * @returns {Promise<{success: boolean, message: string, rawKey?: string}>}
 */
export async function handleKeyStorage(fileId, aesKey, authToken, argon2Salt) {
  // Not logged in - return raw key for display
  if (!authToken || !argon2Salt) {
    const keyBase64 = btoa(String.fromCharCode(...aesKey))
    return {
      success: true,
      message: 'Copy this key to download the file later (not logged in)',
      rawKey: keyBase64,
    }
  }

  // Logged in - will prompt for master password and store encrypted key
  return {
    success: true,
    isLoggedIn: true,
    fileId,
    aesKey,
    argon2Salt,
  }
}

/**
 * Save encrypted key to server
 * @param {string} fileId - The file ID
 * @param {string} encryptedAESKey - Encrypted key in format: iv:authTag:cipherText (all base64)
 * @param {string} authToken - Bearer token
 * @returns {Promise<void>}
 */
export async function saveEncryptedKeyToServer(fileId, encryptedAESKey, authToken) {
  const response = await fetch(`${BASE_URL}/files/${fileId}/store-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ encryptedAESKey }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to save key' }))
    throw new Error(error.error || 'Failed to save key')
  }
}

/**
 * Complete the upload process by encrypting and saving the AES key
 * @param {string} fileId - The file ID
 * @param {Uint8Array} aesKey - The AES key
 * @param {string} masterPassword - The master password
 * @param {string} argon2Salt - Salt from session
 * @param {string} authToken - Bearer token
 * @returns {Promise<string>} - Success message
 */
export async function completeUploadWithKeyStorage(
  fileId,
  aesKey,
  masterPassword,
  argon2Salt,
  authToken
) {
  // Derive master key
  const masterKey = await deriveMasterKey(masterPassword, argon2Salt)

  // Encrypt AES key
  const encryptedKey = await encryptAESKey(aesKey, masterKey)

  // Save to server
  await saveEncryptedKeyToServer(fileId, encryptedKey, authToken)

  // Clear sensitive data from memory
  masterKey.fill(0)

  return 'Key saved securely ✅'
}
