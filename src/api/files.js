import { apiRequest, BASE } from './client.js'

async function bestEffortApiRequest(path, options = {}) {
  try {
    return await apiRequest(path, options)
  } catch (error) {
    if (error?.message === 'Not found') {
      return null
    }

    return null
  }
}

function bytesToBase64(bytes) {
  let binary = ''
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  for (let index = 0; index < array.length; index += 1) {
    binary += String.fromCharCode(array[index])
  }

  return btoa(binary)
}

function normalizeUrl(url) {
  return url ? String(url).replace(/\/$/, '') : ''
}

function base64ToUint8(value) {
  if (!value) {
    return new Uint8Array()
  }

  const binary = atob(String(value))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function responseToEncryptedPayload(response) {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => null)
    const payload = data?.encryptedPayload || data?.payload || data?.dataBase64 || data?.resultDataBase64 || data?.data || ''

    if (typeof payload === 'string') {
      return payload
    }

    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      return bytesToBase64(payload)
    }

    return ''
  }

  if (contentType.includes('text/')) {
    return await response.text().catch(() => '')
  }

  const buffer = await response.arrayBuffer().catch(() => null)
  return buffer ? bytesToBase64(buffer) : ''
}

async function fetchShardPayload(shard, replica) {
  const shardId = shard?.shardId || shard?.id || shard?.fileId
  const replicaUrl = normalizeUrl(replica?.downloadUrl || replica?.url || replica)

  if (!shardId || !replicaUrl) {
    return ''
  }

  const response = await fetch(`${replicaUrl}/shards/${shardId}`)
  if (!response.ok) {
    return ''
  }

  return responseToEncryptedPayload(response)
}

async function fetchShardPayloads(shards) {
  const ordered = [...shards].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  const payloads = []

  for (const shard of ordered) {
    let shardPayload = ''
    const replicas = Array.isArray(shard?.replicas) ? shard.replicas : []

    for (const replica of replicas) {
      shardPayload = await fetchShardPayload(shard, replica)
      if (shardPayload) {
        break
      }
    }

    if (!shardPayload) {
      throw new Error(`Unable to fetch encrypted shard ${shard?.shardId || shard?.id || ''}`.trim())
    }

    payloads.push(shardPayload)
  }

  return payloads.join('')
}

async function fetchRelayShardPayload(shardId, nodeIds) {
  const request = await apiRequest('/relay/shards/fetch', {
    method: 'POST',
    body: JSON.stringify({ shardId, nodeIds }),
  })

  const opId = request?.opId
  if (!opId) {
    return ''
  }

  const startedAt = Date.now()
  const timeoutMs = 60000

  while (Date.now() - startedAt < timeoutMs) {
    const status = await apiRequest(`/relay/shards/fetch/${opId}`)
    if (status?.hasResult && status?.resultDataBase64) {
      return status.resultDataBase64
    }

    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  return ''
}

export async function fetchEncryptedShardPayload(shard) {
  const shardId = shard?.shardId || shard?.id
  const replicas = Array.isArray(shard?.replicas) ? shard.replicas : []

  for (const replica of replicas) {
    const replicaUrl = normalizeUrl(replica?.url)
    if (!replicaUrl || !shardId) {
      continue
    }

    try {
      const response = await fetch(`${replicaUrl}/shards/${shardId}`)
      if (!response.ok) {
        continue
      }

      return responseToEncryptedPayload(response)
    } catch {
      continue
    }
  }

  const relayPayload = await fetchRelayShardPayload(
    shardId,
    replicas.map((replica) => replica?.nodeId).filter(Boolean),
  )

  return relayPayload || ''
}

// File listing and info
export function listFiles() {
  return apiRequest('/files')
}

export function getFileManifest(fileId) {
  return apiRequest(`/files/${fileId}/manifest`)
}

export function getFileDetails(fileId) {
  return apiRequest(`/files/${fileId}`)
}

// File registration and upload
export function registerFile(payload) {
  return apiRequest('/files/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function uploadEncryptedShard(fileId, encryptedPayload) {
  return bestEffortApiRequest(`/files/${fileId}/upload`, {
    method: 'POST',
    body: JSON.stringify({ encryptedPayload }),
  })
}

export async function triggerFilecoinUpload(fileId, dataBase64) {
  return apiRequest(`/files/${fileId}/filecoin/upload`, {
    method: 'POST',
    body: JSON.stringify({ dataBase64 }),
  })
}

export async function fetchFilecoinDownloadStream(fileId) {
  const token = localStorage.getItem('nodio_token')
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}`, 'x-api-token': token } : {}),
  }

  const response = await fetch(`${BASE}/files/${fileId}/download`, {
    method: 'GET',
    headers,
  })

  if (response.status === 409) {
    const error = new Error('Shards are available')
    error.status = 409
    throw error
  }

  if (response.status === 404) {
    const error = new Error('No Filecoin backup')
    error.status = 404
    throw error
  }

  if (response.status === 502) {
    const error = new Error('Retrieval from Filecoin failed')
    error.status = 502
    throw error
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    const error = new Error(message || `Download failed (${response.status})`)
    error.status = response.status
    throw error
  }

  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function fetchFilecoinEncryptedPayload(fileId, cid) {
  // First, try the central server API endpoints using apiRequest so auth headers are included
  const apiCandidatePaths = [
    `/files/${fileId}/download`,
    `/files/${fileId}/filecoin/download`,
    `/files/${fileId}/filecoin/payload`,
  ]

  for (const path of apiCandidatePaths) {
    try {
      console.debug('[nodio] trying central API endpoint via apiRequest:', path)
      const apiResp = await bestEffortApiRequest(path)
      if (!apiResp) {
        console.debug('[nodio] central API returned no data for', path)
        continue
      }

      // apiRequest returns parsed JSON or { message: text } for non-json; extract likely fields
      const payload = apiResp?.encryptedPayload || apiResp?.payload || apiResp?.dataBase64 || apiResp?.resultDataBase64 || apiResp?.data || apiResp
      if (typeof payload === 'string' && payload) {
        console.debug('[nodio] returning payload from central API', path)
        return payload
      }

      // If apiResp is an object with a base64 field inside nested data, try to stringify-search common fields
      const maybeString = JSON.stringify(apiResp || {})
      if (maybeString && maybeString.length > 0) {
        // not ideal, but return empty to let next fallbacks run
        console.debug('[nodio] central API returned object for', path, 'keys=', Object.keys(apiResp || {}))
      }
    } catch (err) {
      console.debug('[nodio] central API call failed for', path, err?.message || err)
      continue
    }
  }

  const candidatePaths = [
    `/files/${fileId}/filecoin/download`,
    `/files/${fileId}/download`,
    `/files/${fileId}/filecoin/payload`,
  ]

  for (const path of candidatePaths) {
    const url = `${BASE}${path}`
    try {
      console.debug('[nodio] trying Filecoin payload endpoint (raw fetch):', url)
      const res = await fetch(url, { method: 'GET' })
      if (!res.ok) {
        console.debug('[nodio] endpoint responded non-OK', url, res.status)
        // try next
        continue
      }

      const payload = await responseToEncryptedPayload(res)
      if (payload) {
        console.debug('[nodio] returning payload from', url, 'len=', payload.length)
        return payload
      }
    } catch (err) {
      // continue to next candidate
      continue
    }
  }

  // If we have a CID, try public IPFS gateways as a last-resort fallback
  const gateways = cid
    ? [
        `https://dweb.link/ipfs/${cid}`,
        `https://ipfs.io/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
      ]
    : []

  for (const g of gateways) {
    try {
      console.debug('[nodio] trying public IPFS gateway fallback:', g)
      const res = await fetch(g, { method: 'GET' })
      if (!res.ok) {
        console.debug('[nodio] gateway responded non-OK', g, res.status)
        continue
      }

      const payload = await responseToEncryptedPayload(res)
      if (payload) {
        console.debug('[nodio] returning payload from gateway', g, 'len=', payload.length)
        return payload
      }
    } catch (err) {
      continue
    }
  }

  return ''
}

export async function fetchEncryptedData(fileId, manifest) {
  const shards = Array.isArray(manifest?.shards) ? manifest.shards : []

  if (shards.length === 0) {
    return []
  }

  const ordered = [...shards].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  const payloads = []

  for (const shard of ordered) {
    const payload = await fetchEncryptedShardPayload(shard)
    if (!payload) {
      throw new Error('Could not retrieve file from network. Try again later.')
    }

    payloads.push(payload)
  }

  return payloads
}

// File operations - delete, restore, star
export function deleteFile(fileId) {
  return apiRequest(`/files/${fileId}`, { method: 'DELETE' })
}

export function restoreFile(fileId) {
  return bestEffortApiRequest(`/files/${fileId}/restore`, { method: 'POST' })
}

export function permanentlyDeleteFile(fileId) {
  return bestEffortApiRequest(`/files/${fileId}/permanent-delete`, { method: 'DELETE' })
}

export function starFile(fileId) {
  return bestEffortApiRequest(`/files/${fileId}/star`, { method: 'POST' })
}

export function unstarFile(fileId) {
  return bestEffortApiRequest(`/files/${fileId}/unstar`, { method: 'POST' })
}

// Secure file key operations (new flow)
export function storeFileKey(fileId, encryptedAESKey) {
  return apiRequest(`/files/${fileId}/store-key`, {
    method: 'POST',
    body: JSON.stringify({ encryptedAESKey }),
  })
}

export function fetchFileKey(fileId) {
  return apiRequest(`/files/${fileId}/key`)
}

// Folder operations
export function listFolders() {
  return bestEffortApiRequest('/folders')
}

export function createFolder(payload) {
  return bestEffortApiRequest('/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getFolderContents(folderId) {
  return bestEffortApiRequest(`/folders/${folderId}`)
}

export function deleteFolder(folderId) {
  return bestEffortApiRequest(`/folders/${folderId}`, { method: 'DELETE' })
}

export function renameFolder(folderId, name) {
  return bestEffortApiRequest(`/folders/${folderId}`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  })
}

// File/folder moving
export function moveFile(fileId, folderId) {
  return bestEffortApiRequest(`/files/${fileId}/move`, {
    method: 'PUT',
    body: JSON.stringify({ folderId }),
  })
}
