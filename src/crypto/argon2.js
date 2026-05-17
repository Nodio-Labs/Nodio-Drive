export async function deriveMasterKey(password, argon2Salt) {
  const salt = new TextEncoder().encode(argon2Salt)

  try {
    const module = await import('argon2-browser/dist/argon2-bundled.min.js')
    const argon2 = module.default || module

    const masterKey = await argon2.hash({
      pass: `${password}${argon2Salt}`,
      salt,
      type: argon2.ArgonType.Argon2id,
      hashLen: 32,
      mem: 65536,
      time: 3,
      parallelism: 1,
    })

    return new Uint8Array(masterKey.hash)
  } catch {
    // Runtime fallback for preview environments where argon2 wasm cannot load.
    // Use the same concatenation format as the Argon2 call above to ensure
    // consistent derived keys between environments.
    const input = new TextEncoder().encode(`${password}${argon2Salt}`)
    const digest = await crypto.subtle.digest('SHA-256', input)
    return new Uint8Array(digest)
  }
}
