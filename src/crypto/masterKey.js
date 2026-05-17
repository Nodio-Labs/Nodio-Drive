import { hash } from './argon2.js'
import { encryptAES, decryptAES } from './aes.js'

/**
 * Derive master key from master password using Argon2id
 * @param {string} masterPassword - The master password
 * @param {string} argon2Salt - Salt from user session
 * @returns {Promise<Uint8Array>} - 32-byte master key
 */
export async function deriveMasterKey(masterPassword, argon2Salt) {
  const input = masterPassword + argon2Salt
  const key = await hash(input, {
    hashLength: 32,
    memory: 65536,
    time: 3,
    parallelism: 1,
  })
  return key
}

/**
 * Encrypt AES key with master key using AES-256-GCM
 * Returns format: ivBase64:authTagBase64:cipherTextBase64
 * @param {Uint8Array} aesKey - The AES key to encrypt
 * @param {Uint8Array} masterKey - The master key (32 bytes)
 * @returns {Promise<string>} - Encrypted key in format: iv:authTag:cipherText (all base64)
 */
export async function encryptAESKey(aesKey, masterKey) {
  const { iv, authTag, cipherText } = await encryptAES(aesKey, masterKey)

  const ivBase64 = btoa(String.fromCharCode(...iv))
  const authTagBase64 = btoa(String.fromCharCode(...authTag))
  const cipherTextBase64 = btoa(String.fromCharCode(...cipherText))

  return `${ivBase64}:${authTagBase64}:${cipherTextBase64}`
}

/**
 * Decrypt AES key with master key
 * Input format: ivBase64:authTagBase64:cipherTextBase64
 * @param {string} encryptedKey - Encrypted key in format: iv:authTag:cipherText (all base64)
 * @param {Uint8Array} masterKey - The master key (32 bytes)
 * @returns {Promise<Uint8Array>} - Decrypted AES key
 */
export async function decryptAESKey(encryptedKey, masterKey) {
  const [ivBase64, authTagBase64, cipherTextBase64] = encryptedKey.split(':')

  const iv = new Uint8Array(atob(ivBase64).split('').map((c) => c.charCodeAt(0)))
  const authTag = new Uint8Array(atob(authTagBase64).split('').map((c) => c.charCodeAt(0)))
  const cipherText = new Uint8Array(
    atob(cipherTextBase64)
      .split('')
      .map((c) => c.charCodeAt(0))
  )

  return await decryptAES(cipherText, masterKey, iv, authTag)
}
