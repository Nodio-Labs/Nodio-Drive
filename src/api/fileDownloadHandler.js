import { decryptAESKey, deriveMasterKey } from '../crypto/masterKey.js'

const BASE_URL = '/api'

/**
 * Fetch encrypted AES key from server
 * @param {string} fileId - The file ID
 * @param {string} authToken - Bearer token
 * @returns {Promise<string>} - Encrypted key in format: iv:authTag:cipherText (all base64)
 */
export async function fetchEncryptedKeyFromServer(fileId, authToken) {
  const response = await fetch(`${BASE_URL}/files/${fileId}/key`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      return null // No stored key, user must use key-base64
    }
    throw new Error('Failed to fetch encrypted key from server')
  }

  const data = await response.json()
  return data.encryptedAESKey
}

/**
 * Determine which key to use for download
 * Priority: key-base64 (if provided) > server-stored key (if logged in) > error
 * @param {string|null} keyBase64 - The key-base64 parameter if provided
 * @param {string|null} authToken - Auth token if logged in
 * @returns {{source: 'direct'|'server'|null, keyBase64?: string}}
 */
export function determineKeySource(keyBase64, authToken) {
  if (keyBase64) {
    return { source: 'direct', keyBase64 }
  }

  if (authToken) {
    return { source: 'server' }
  }

  return { source: null }
}

/**
 * Recover AES key from server using master password
 * @param {string} fileId - The file ID
 * @param {string} masterPassword - The master password
 * @param {string} argon2Salt - Salt from session
 * @param {string} authToken - Bearer token
 * @returns {Promise<Uint8Array>} - Decrypted AES key
 */
export async function recoverKeyFromServer(fileId, masterPassword, argon2Salt, authToken) {
  // Fetch encrypted key
  const encryptedKey = await fetchEncryptedKeyFromServer(fileId, authToken)

  if (!encryptedKey) {
    throw new Error(
      'Key not found on server. Please provide key-base64 parameter or login and upload the file again.'
    )
  }

  try {
    // Derive master key
    const masterKey = await deriveMasterKey(masterPassword, argon2Salt)

    // Decrypt AES key
    const aesKey = await decryptAESKey(encryptedKey, masterKey)

    // Clear sensitive data from memory
    masterKey.fill(0)

    return aesKey
  } catch (err) {
    throw new Error('Wrong master password')
  }
}

/**
 * Prepare AES key for download
 * @param {string|null} keyBase64 - The key-base64 parameter if provided
 * @param {string|null} authToken - Auth token if logged in
 * @param {string|null} argon2Salt - Salt from session
 * @returns {{requiresMasterPassword: boolean, keyBase64?: string, needsLogin: boolean}}
 */
export function prepareDownloadKey(keyBase64, authToken, argon2Salt) {
  const keySource = determineKeySource(keyBase64, authToken)

  if (keySource.source === 'direct') {
    // Use provided key directly
    return { requiresMasterPassword: false, keyBase64: keySource.keyBase64 }
  }

  if (keySource.source === 'server') {
    // Need master password to recover key from server
    return { requiresMasterPassword: true }
  }

  // No key available and not logged in
  return { needsLogin: true }
}
