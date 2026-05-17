function toBase64(bytes) {
  let binary = ''
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  array.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function fromBase64(value) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes
}

async function importAesKey(rawKey) {
  return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ])
}

async function encryptBytes(payload, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey(rawKey)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    payload,
  )

  const merged = new Uint8Array(iv.length + encrypted.byteLength)
  merged.set(iv, 0)
  merged.set(new Uint8Array(encrypted), iv.length)

  return toBase64(merged)
}

async function decryptBytes(payload, rawKey) {
  const merged = fromBase64(payload)
  const iv = merged.slice(0, 12)
  const encrypted = merged.slice(12)
  const key = await importAesKey(rawKey)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted,
  )

  return new Uint8Array(decrypted)
}

export async function encryptFileWithKey(file, fileKey) {
  const payload = await file.arrayBuffer()
  return encryptBytes(payload, fileKey)
}

export async function decryptFileWithKey(payload, fileKey) {
  return decryptBytes(payload, fileKey)
}

export async function encryptKeyWithMaster(fileKey, masterKey) {
  return encryptBytes(fileKey, masterKey)
}

export async function decryptKeyWithMaster(encryptedFileKey, masterKey) {
  return decryptBytes(encryptedFileKey, masterKey)
}

// New format: ivBase64:authTagBase64:cipherTextBase64
export async function encryptKeyForStorage(fileKey, masterKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await importAesKey(masterKey)

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    fileKey,
  )

  // Extract auth tag (last 16 bytes) and cipher text
  const encryptedArray = new Uint8Array(encrypted)
  const authTag = encryptedArray.slice(-16)
  const cipherText = encryptedArray.slice(0, -16)

  const ivB64 = toBase64(iv)
  const authTagB64 = toBase64(authTag)
  const cipherB64 = toBase64(cipherText)

  return `${ivB64}:${authTagB64}:${cipherB64}`
}

export async function decryptKeyFromStorage(encryptedKeyStr, masterKey) {
  const parts = encryptedKeyStr.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format')
  }

  const [ivB64, authTagB64, cipherB64] = parts
  const iv = fromBase64(ivB64)
  const authTag = fromBase64(authTagB64)
  const cipherText = fromBase64(cipherB64)

  // Reconstruct full encrypted data with auth tag appended
  const encrypted = new Uint8Array(cipherText.length + authTag.length)
  encrypted.set(cipherText, 0)
  encrypted.set(authTag, cipherText.length)

  const key = await importAesKey(masterKey)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted,
  )

  return new Uint8Array(decrypted)
}
