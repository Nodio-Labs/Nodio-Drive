import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Check,
  Download,
  Folder,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Lock,
  Gem,
  Search,
  Settings,
  Star,
  Trash2,
  Upload,
  Clock3,
  UserCircle,
} from 'lucide-react'
import {
  deleteFile,
  fetchEncryptedData,
  fetchFilecoinDownloadStream,
  getFileManifest,
  listFiles,
  registerFile,
  triggerFilecoinUpload,
  starFile,
  unstarFile,
  restoreFile,
  permanentlyDeleteFile,
  createFolder,
  deleteFolder,
  listFolders,
  getFolderContents,
  storeFileKey,
  fetchFileKey,
} from '../api/files.js'
import ContextMenu from '../components/ContextMenu.jsx'
import MasterPasswordPromptModal from '../components/MasterPasswordModal.jsx'
import PasswordPrompt from '../components/PasswordPrompt.jsx'
import UploadModal from '../components/UploadModal.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useMasterPassword } from '../hooks/useMasterPassword.js'
import {
  encryptFileWithKey,
  encryptKeyWithMaster,
  encryptKeyForStorage,
  decryptKeyFromStorage,
} from '../crypto/aes.js'
import { deriveMasterKey } from '../crypto/argon2.js'
import { formatDate } from '../utils/formatDate.js'
import { formatSize } from '../utils/formatSize.js'
import { getFileExtension, getFileIcon } from '../utils/fileIcons.js'

function DockGlyph({ id }) {
  const common = { size: 28, strokeWidth: 2.1, color: '#ffffff' }

  switch (id) {
    case 'drive':
      return <FolderUp {...common} fill="none" />
    case 'recent':
      return <Clock3 {...common} fill="none" />
    case 'starred':
      return <Star {...common} fill="#ffffff" />
    case 'upload':
      return <CloudUpload {...common} fill="none" />
    case 'trash':
      return <Trash2 {...common} fill="none" />
    case 'pricing':
      return <Gem {...common} fill="none" />
    case 'profile':
      return (
        <span className="dock-user-icon-wrap">
          <UserCircle {...common} fill="none" />
          <span className="dock-user-badge" aria-hidden="true">
            <Check size={8} strokeWidth={3} />
          </span>
        </span>
      )
    default:
      return <Folder {...common} fill="none" />
  }
}

const dockItems = [
  { id: 'drive', label: 'Drive' },
  { id: 'recent', label: 'Recent' },
  { id: 'starred', label: 'Starred' },
  { id: 'upload', label: 'Upload' },
  { id: 'trash', label: 'Trash' },
  { id: 'pricing', label: 'Plans' },
  { id: 'profile', label: 'User' },
]

const dockGradients = {
  drive: 'linear-gradient(145deg, #818cf8 0%, #3730a3 100%)',
  recent: 'linear-gradient(145deg, #38bdf8 0%, #0369a1 100%)',
  starred: 'linear-gradient(145deg, #fbbf24 0%, #92400e 100%)',
  upload: 'linear-gradient(145deg, #4ade80 0%, #166534 100%)',
  trash: 'linear-gradient(145deg, #94a3b8 0%, #1e293b 100%)',
  pricing: 'linear-gradient(145deg, #f472b6 0%, #831843 100%)',
  profile: 'linear-gradient(145deg, #c084fc 0%, #5b21b6 100%)',
}

function decodeBase64Key(value) {
  if (!value || typeof value !== 'string') {
    return null
  }

  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

function base64ToUint8(b64) {
  return Uint8Array.from(atob(b64), (character) => character.charCodeAt(0))
}

function concatUint8Arrays(chunks) {
  const arrays = chunks.map((chunk) => (chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)))
  const totalLength = arrays.reduce((total, chunk) => total + chunk.length, 0)
  const merged = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of arrays) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

function splitEncryptedStreamBytes(encryptedBytes) {
  if (!(encryptedBytes instanceof Uint8Array) || encryptedBytes.length <= 28) {
    throw new Error('Invalid encrypted download payload')
  }

  const iv = encryptedBytes.slice(0, 12)
  const authTag = encryptedBytes.slice(-16)
  const ciphertext = encryptedBytes.slice(12, -16)

  if (ciphertext.length === 0) {
    throw new Error('Invalid encrypted download payload')
  }

  return { iv, authTag, ciphertext }
}

async function decryptAesGcmPayload(rawKeyBytes, ivBytes, encryptedBytes) {
  const key = await crypto.subtle.importKey('raw', rawKeyBytes, 'AES-GCM', false, ['decrypt'])
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, encryptedBytes)
  return new Uint8Array(decrypted)
}

function normalizeFiles(response) {
  const candidates = response?.files || response?.data?.files || response?.data || response || []

  return candidates.map((file) => ({
    id: String(file.id || file.fileId || file._id || crypto.randomUUID()),
    name: file.name || file.originalName || file.filename || 'untitled',
    size: Number(file.size || file.sizeBytes || 0),
    createdAt: file.createdAt || file.uploadedAt || file.date || new Date().toISOString(),
    cid: file.cid || file.filecoinCid || '',
    encryptedAESKey: file.encryptedAESKey || '',
    filecoinBacked: Boolean(file.filecoinBacked || file.filecoinBackedUp || file.backedUp),
    starred: Boolean(file.starred),
    deleted: Boolean(file.deleted || file.trashed || file.deletedAt),
    kind: 'file',
    locked: true,
  }))
}

function downloadBlob(fileName, bytes) {
  const blob = new Blob([bytes])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  URL.revokeObjectURL(link.href)
  document.body.removeChild(link)
}

async function waitForFileManifest(fileId, onProgress) {
  const startedAt = Date.now()
  const timeoutMs = 120000
  let attempts = 0

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const manifestResponse = await getFileManifest(fileId)
      const manifest = manifestResponse?.manifest || manifestResponse?.data || manifestResponse
      const fileManifest = manifest?.file || manifest
      const cid = fileManifest?.filecoinCid || fileManifest?.cid || ''
      const backedUp = Boolean(fileManifest?.filecoinBackedUp || fileManifest?.filecoinBacked || fileManifest?.backedUp || cid)

      if (cid || backedUp) {
        return { manifest: fileManifest, cid, backedUp }
      }
    } catch (manifestError) {
      if (manifestError?.message !== 'Not found') {
        throw manifestError
      }
    }

    attempts += 1
    onProgress?.(Math.min(95, 85 + Math.min(10, attempts * 2)))
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  throw new Error('Upload finished, but Filecoin backup is still processing. Please refresh in a moment.')
}

async function waitForDownloadableManifest(fileId, onProgress) {
  const startedAt = Date.now()
  const timeoutMs = 600000
  let attempts = 0

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const manifestResponse = await getFileManifest(fileId)
      const manifest = manifestResponse?.manifest || manifestResponse?.data || manifestResponse
      const fileManifest = manifest?.file || manifest || {}
      const shards = Array.isArray(manifest?.shards) ? [...manifest.shards].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) : []
      const hasReplicaCandidates = shards.length > 0 && shards.every((shard) => Array.isArray(shard?.replicas) && shard.replicas.length > 0)

      if (shards.length > 0 && hasReplicaCandidates) {
        return { manifest: fileManifest, shards }
      }
    } catch (manifestError) {
      if (manifestError?.message !== 'Not found') {
        throw manifestError
      }
    }

    attempts += 1
    onProgress?.(Math.min(95, 70 + Math.min(25, attempts * 2)))
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }

  throw new Error('File backup is still processing. Please try again in a moment.')
}

function FileRow({ item, selected, onSelect, onDownload, onDelete, onOpenFolder, onStar }) {
  const Icon = item.kind === 'folder' ? Folder : getFileIcon(item.name)
  const isFolder = item.kind === 'folder'

  const handleRowClick = (event) => {
    event.stopPropagation()
    if (isFolder) {
      onOpenFolder(item)
    } else {
      onSelect(item)
    }
  }

  return (
    <div className={`finder-row ${selected ? 'is-selected' : ''}`.trim()} onClick={handleRowClick} style={{ cursor: isFolder ? 'pointer' : 'default' }}>
      <span className="finder-checkbox" aria-hidden="true" />
      <span className="finder-name-cell">
        <Icon size={18} strokeWidth={1.75} />
        <span>{item.name}</span>
      </span>
      <span className="finder-type">{isFolder ? 'FOLDER' : getFileExtension(item.name).toUpperCase()}</span>
      <span className="finder-size">{isFolder ? '--' : formatSize(item.size)}</span>
      <span className="finder-date">{formatDate(item.createdAt)}</span>
      <span className="finder-lock">{isFolder ? '' : <Lock size={14} />}</span>
      {!isFolder && (
        <span className="finder-row-actions" onClick={(event) => event.stopPropagation()}>
          {onStar && (
            <button type="button" onClick={() => onStar(item)} aria-label={item.starred ? 'Unstar' : 'Star'}>
              <Star size={14} fill={item.starred ? 'currentColor' : 'none'} />
            </button>
          )}
          <button type="button" onClick={() => onDownload(item)} aria-label="Download">
            <Download size={14} />
          </button>
          <button type="button" onClick={() => onDelete(item)} aria-label="Delete">
            <Trash2 size={14} />
          </button>
        </span>
      )}
    </div>
  )
}

export default function Drive() {
  const { apiToken, argon2Salt, email, masterKey, setMasterKey, logout } = useAuth()
  const navigate = useNavigate()
  const {
    masterPassword,
    masterPasswordError,
    showMasterPasswordPrompt,
    setMasterPasswordFromInput,
    requestMasterPassword,
    setShowMasterPasswordPrompt,
    setMasterPasswordError,
  } = useMasterPassword()

  const [clock, setClock] = useState(() => new Date())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [currentFolderPath, setCurrentFolderPath] = useState([])
  const [section, setSection] = useState('drive')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [activePanel, setActivePanel] = useState('drive')
  const [bouncingDock, setBouncingDock] = useState('')
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailPanelFile, setDetailPanelFile] = useState(null)
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, items: [] })
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [unlockError, setUnlockError] = useState('')
  const [downloadStatus, setDownloadStatus] = useState('')
  const [pendingDownloadItem, setPendingDownloadItem] = useState(null)
  const [showKeyStoragePrompt, setShowKeyStoragePrompt] = useState(false)
  const [pendingKeyStorageFileId, setPendingKeyStorageFileId] = useState(null)
  const [pendingFileKey, setPendingFileKey] = useState(null)
  const [keyStorageError, setKeyStorageError] = useState('')
  const [keyStorageLoading, setKeyStorageLoading] = useState(false)
  const newFolderInputRef = useRef(null)
  const mainAreaRef = useRef(null)

  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const fetchFiles = async () => {
    setLoading(true)
    setError('')


    try {
      const response = await listFiles()
      setFiles(normalizeFiles(response))
    } catch (loadError) {
      setError(loadError.message || 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (apiToken) {
      fetchFiles()
    }
  }, [apiToken])

  // Prompt for master password on initial load
  useEffect(() => {
    if (apiToken && !masterKey && !showMasterPasswordPrompt) {
      requestMasterPassword()
    }
  }, [apiToken, masterKey, showMasterPasswordPrompt, requestMasterPassword])

  // Handle master password submission
  const handleMasterPasswordSubmit = async (password) => {
    setMasterPasswordError('')
    try {
      const derivedKey = await deriveMasterKey(password, argon2Salt)
      // Non-sensitive preview for debugging: show first 8 bytes as hex
      try {
        const preview = Array.from(derivedKey.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('')
        console.debug('[nodio] derived masterKey preview on submit:', preview)
      } catch {}
      setMasterPasswordFromInput(password)
      setMasterKey(derivedKey)
    } catch (err) {
      setMasterPasswordError(err.message || 'Failed to derive master key')
    }
  }

  const handleMasterPasswordCancel = () => {
    setShowMasterPasswordPrompt(false)
    // Logout if they cancel
    logout()
    navigate('/login')
  }

  const handleUnlock = async (password) => {
    setUnlockError('')

    try {
      const key = await deriveMasterKey(password, argon2Salt)
      setMasterKey(key)

      const downloadTarget = pendingDownloadItem

      if (downloadTarget) {
        await performDownload(downloadTarget, key)
        setPendingDownloadItem(null)
      }
    } catch (unlockErr) {
      setUnlockError(unlockErr.message || 'Unable to unlock drive')
    }
  }

  const performDownload = async (item, activeMasterKey = masterKey) => {
    if (item.kind === 'folder') return

    let manifestResponse

    try {
      manifestResponse = await getFileManifest(item.id)
    } catch (manifestError) {
      throw new Error('Could not load file details.')
    }

    console.log('[nodio] file manifest response', item.id, manifestResponse)

    const manifest = manifestResponse?.manifest || manifestResponse?.data || manifestResponse
    const fileManifest = manifest?.file || manifest || {}
    let rawAESKey = null

    // Check if we have key-base64 in the manifest (old format - raw AES key)
    const encryptedAESKey = fileManifest?.encryptedAESKey
    const hasColons = encryptedAESKey && encryptedAESKey.includes(':')

    if (encryptedAESKey && !hasColons) {
      // Old format: key-base64 (raw AES key)
      try {
        rawAESKey = base64ToUint8(encryptedAESKey)
      } catch {
        throw new Error('Invalid key format')
      }
    } else if (encryptedAESKey && hasColons) {
      // New format: encrypted key stored in manifest
      if (!activeMasterKey) {
        throw new Error('Unlock your drive first to download this file')
      }

      const [ivB64, authTagB64, cipherB64] = encryptedAESKey.split(':')
      if (!ivB64 || !authTagB64 || !cipherB64) {
        throw new Error('Decryption failed. Your key may be incorrect.')
      }

      try {
        console.debug('[nodio] attempting to decrypt manifest-encryptedAESKey for', item.id)
        console.debug('[nodio] encryptedAESKey preview:', encryptedAESKey.substring(0, 40) + '...')
        rawAESKey = await decryptKeyFromStorage(encryptedAESKey, activeMasterKey)
        console.debug('[nodio] manifest key decrypted; rawAESKey len=', rawAESKey?.length)
      } catch (decErr) {
        console.error('[nodio] manifest key decryption failed for', item.id, decErr)
        throw new Error('Wrong master password')
      }
    } else {
      // Key not in manifest, fetch from server (new server-stored format)
      if (!activeMasterKey) {
        throw new Error('Unlock your drive first to download this file')
      }

      try {
        const keyResponse = await fetchFileKey(item.id)
        const serverEncryptedKey = keyResponse?.encryptedAESKey
        if (!serverEncryptedKey) {
          throw new Error('No key found on server')
        }

        // Decrypt the server key
        rawAESKey = await decryptKeyFromStorage(serverEncryptedKey, activeMasterKey)
      } catch (decryptErr) {
        if (decryptErr.message === 'Invalid encrypted key format' || decryptErr.message === 'No key found on server') {
          throw new Error('Wrong master password')
        }
        throw decryptErr
      }
    }

    if (!rawAESKey) {
      throw new Error('Could not obtain decryption key')
    }

    const shardMetadata = fileManifest?.metadata?.encryption?.shards
    const shards = Array.isArray(manifest?.shards) ? [...manifest.shards].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)) : []
    const filecoinBackedUp = Boolean(fileManifest?.filecoinBackedUp || fileManifest?.filecoinBacked || fileManifest?.backedUp)

    let decryptedBytes

    if (!shards.length && filecoinBackedUp) {
      setDownloadStatus('Retrieving file from Filecoin — this may take several minutes...')

      try {
        const encryptedDownload = await fetchFilecoinDownloadStream(item.id)
        const { iv, authTag, ciphertext } = splitEncryptedStreamBytes(encryptedDownload)
        const decryptedPayload = await decryptAesGcmPayload(
          rawAESKey,
          iv,
          concatUint8Arrays([ciphertext, authTag]),
        )
        decryptedBytes = new Blob([decryptedPayload])
      } catch (downloadErr) {
        setDownloadStatus('')

        if (downloadErr?.status === 409) {
          const readyManifest = await waitForDownloadableManifest(item.id, (nextProgress) => {
            setDownloadStatus(`File backup is still processing. Waiting... ${nextProgress}%`)
          })
          setDownloadStatus('')

          const refreshedShards = Array.isArray(readyManifest?.shards) ? [...readyManifest.shards].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)) : []
          const refreshedHasReplicaCandidates = refreshedShards.some((shard) => Array.isArray(shard?.replicas) && shard.replicas.length > 0)

          if (Array.isArray(shardMetadata) && shardMetadata.length > 0 && refreshedShards.length > 0 && shardMetadata.length === refreshedShards.length && refreshedHasReplicaCandidates) {
            const encryptedShards = await fetchEncryptedData(item.id, { shards: refreshedShards })
            if (!Array.isArray(encryptedShards) || encryptedShards.length !== refreshedShards.length) {
              throw new Error('Could not retrieve file from network. Try again later.')
            }

            const decryptedShards = []
            for (let index = 0; index < refreshedShards.length; index += 1) {
              const shardMeta = shardMetadata[index]
              const encryptedShard = base64ToUint8(encryptedShards[index])
              const shardIv = base64ToUint8(shardMeta.iv)
              const authTagBytes = base64ToUint8(shardMeta.authTag)

              try {
                const decryptedShard = await decryptAesGcmPayload(
                  rawAESKey,
                  shardIv,
                  concatUint8Arrays([encryptedShard, authTagBytes]),
                )
                decryptedShards.push(decryptedShard)
              } catch {
                throw new Error('Decryption failed. Your key may be incorrect.')
              }
            }

            decryptedBytes = new Blob(decryptedShards)
          } else {
            throw new Error('File backup is still processing. Please try again in a moment.')
          }
        } else if (downloadErr?.status === 404) {
          throw new Error('No Filecoin backup — please retry later or use CLI.')
        } else if (downloadErr?.status === 502) {
          throw new Error('Retrieval from Filecoin failed — try again later or use the CLI.')
        } else {
          throw downloadErr
        }
      }
    } else if (Array.isArray(shardMetadata) && shardMetadata.length > 0 && shards.length > 0 && shardMetadata.length === shards.length && shards.some((shard) => Array.isArray(shard?.replicas) && shard.replicas.length > 0)) {
      try {
        const encryptedShards = await fetchEncryptedData(item.id, { shards })
        if (!Array.isArray(encryptedShards) || encryptedShards.length !== shards.length) {
          throw new Error('Could not retrieve file from network. Try again later.')
        }

        const decryptedShards = []

        for (let index = 0; index < shards.length; index += 1) {
          const shardMeta = shardMetadata[index]
          const encryptedShard = base64ToUint8(encryptedShards[index])
          const shardIv = base64ToUint8(shardMeta.iv)
          const authTagBytes = base64ToUint8(shardMeta.authTag)

          try {
            const decryptedShard = await decryptAesGcmPayload(
              rawAESKey,
              shardIv,
              concatUint8Arrays([encryptedShard, authTagBytes]),
            )
            decryptedShards.push(decryptedShard)
          } catch {
            throw new Error('Decryption failed. Your key may be incorrect.')
          }
        }

        decryptedBytes = new Blob(decryptedShards)
      } catch (shardError) {
        throw shardError
      }
    }

    if (!decryptedBytes) {
      if (!shards.length && !filecoinBackedUp) {
        throw new Error('No donor shards and no Filecoin backup — cannot download.')
      }

      throw new Error('Could not retrieve file from network. Try again later.')
    }

    setDownloadStatus('')
    const blob = decryptedBytes
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileManifest.originalName || item.name
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const handleUpload = async () => {
    if (!uploadFile || !masterKey) {
      return
    }

    setUploading(true)
    setUploadProgress(5)

    try {
      const fileKey = crypto.getRandomValues(new Uint8Array(32))
      const encryptedPayload = await encryptFileWithKey(uploadFile, fileKey)
      setUploadProgress(20)

      const encryptedAESKey = await encryptKeyWithMaster(fileKey, masterKey)
      setUploadProgress(35)

      const registration = await registerFile({
        originalName: uploadFile.name,
        sizeBytes: uploadFile.size,
        mimeType: uploadFile.type,
        encryptedAESKey,
      })
      setUploadProgress(50)

      const fileId = registration?.fileId || registration?.id
      if (!fileId) {
        throw new Error('File registration did not return a file id')
      }

      setUploadProgress(60)
      let uploadResponse
      try {
        uploadResponse = await triggerFilecoinUpload(fileId, encryptedPayload)
        console.log('[nodio] filecoin upload response', fileId, uploadResponse)
      } catch (filecoinError) {
        console.warn('[nodio] Filecoin upload failed (will retry), but file is registered:', filecoinError)
        // Don't throw - continue with key storage even if Filecoin upload times out
        uploadResponse = {}
      }
      setUploadProgress(80)

      const { manifest, cid, backedUp } = await waitForFileManifest(fileId, (nextProgress) => {
        setUploadProgress(nextProgress)
      })
      console.log('[nodio] persisted file manifest', fileId, manifest)

      const normalizedUpdate = {
        cid: uploadResponse?.filecoinCid || uploadResponse?.cid || manifest?.filecoinCid || manifest?.cid || cid || '',
        encryptedAESKey: manifest?.encryptedAESKey || uploadResponse?.encryptedAESKey || encryptedAESKey,
        filecoinBacked: backedUp,
      }

      setFiles((prev) =>
        prev.map((file) =>
          file.id === fileId
            ? { ...file, ...normalizedUpdate }
            : file
        )
      )
      setSelectedItem((prev) => (prev?.id === fileId ? { ...prev, ...normalizedUpdate } : prev))
      setDetailPanelFile((prev) => (prev?.id === fileId ? { ...prev, ...normalizedUpdate } : prev))

      setUploadProgress(100)

      // If logged in, automatically store key using the master password from session or available derived masterKey
      if (apiToken && (masterPassword || masterKey)) {
        // Auto-store the key with the session master password/derived key
        setPendingKeyStorageFileId(fileId)
        setPendingFileKey(fileKey)
        setKeyStorageError('')

        // Automatically attempt to encrypt & store the key using the in-memory masterKey when possible
        try {
          console.log('[nodio] Using session master credentials to encrypt file key...')
          const masterKeyDerived = masterKey || (masterPassword ? await deriveMasterKey(masterPassword, argon2Salt) : null)
          if (!masterKeyDerived) throw new Error('No master key available to encrypt file key')
          try {
            const preview = Array.from(masterKeyDerived.slice(0, 8)).map((b) => b.toString(16).padStart(2, '0')).join('')
            console.debug('[nodio] masterKey preview used for auto-store:', preview)
          } catch {}
          console.log('[nodio] Master key ready for encryption')

          const encryptedKey = await encryptKeyForStorage(fileKey, masterKeyDerived)
          console.log('[nodio] File key encrypted with master key (format: iv:authTag:cipherText)')
          console.log('[nodio] Encrypted key preview:', encryptedKey.substring(0, 50) + '...')
          console.log('[nodio] Sending encrypted key to server POST /api/files/' + fileId + '/store-key')

          await storeFileKey(fileId, encryptedKey)
          console.log('[nodio] ✅ File key saved securely on server')
          console.log('[nodio] Upload complete - file and encrypted key both stored')

          // Success!
          setShowUpload(false)
          setUploadFile(null)
          setPendingKeyStorageFileId(null)
          setPendingFileKey(null)
        } catch (autoStoreError) {
          console.error('[nodio] ❌ Failed to auto-store file key:', autoStoreError.message)
          console.error('[nodio] Error details:', autoStoreError)
          // If auto-store fails, show prompt for user to try manually
          setShowKeyStoragePrompt(true)
          setKeyStorageError(autoStoreError.message || 'Failed to store key, please try manually')
        }
      } else if (apiToken) {
        console.warn('[nodio] No master password in session, prompting user...')
        // No master password in session (shouldn't happen), prompt for it
        setPendingKeyStorageFileId(fileId)
        setPendingFileKey(fileKey)
        setShowKeyStoragePrompt(true)
        setKeyStorageError('')
      } else {
        // If not logged in, show raw key
        const keyBase64 = Array.from(fileKey).map(b => String.fromCharCode(b)).join('')
        const encodedKey = btoa(keyBase64)
        console.log('[nodio] raw aes256KeyBase64:', encodedKey)
        alert(`Key (save this):\n${encodedKey}`)
        setShowUpload(false)
        setUploadFile(null)
      }

      fetchFiles()
    } catch (uploadError) {
      console.error('[nodio] ❌ Upload error:', uploadError.message)
      setError(uploadError.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleStoreFileKey = async (masterPassword) => {
    setKeyStorageError('')
    setKeyStorageLoading(true)

    try {
      if (!pendingKeyStorageFileId || !pendingFileKey) {
        throw new Error('No pending key storage')
      }

      console.log('[nodio] Storing file key with user-provided master password...')
      // Derive master key from password
      const masterKeyDerived = await deriveMasterKey(masterPassword, argon2Salt)
      console.log('[nodio] Master key derived from password')

      // Encrypt the file key with master key in the new format
      const encryptedKey = await encryptKeyForStorage(pendingFileKey, masterKeyDerived)
      console.log('[nodio] File key encrypted with master key:', encryptedKey)
      console.log('[nodio] Sending encrypted key to server...')

      // Store on server
      await storeFileKey(pendingKeyStorageFileId, encryptedKey)
      console.log('[nodio] File key saved securely ✅')

      // Success!
      setShowKeyStoragePrompt(false)
      setPendingKeyStorageFileId(null)
      setPendingFileKey(null)
      setShowUpload(false)
      setUploadFile(null)
      
      // Show success message in a banner or notification
      setError('') // Clear any existing errors
      // Could add a success state here if desired
    } catch (storeError) {
      console.error('[nodio] Failed to store file key:', storeError)
      setKeyStorageError(storeError.message || 'Failed to store key')
    } finally {
      setKeyStorageLoading(false)
    }
  }

  const handleDownload = async (item) => {
    if (item.kind === 'folder') return

    try {
      if (!masterKey) {
        setUnlockError('')
        setPendingDownloadItem(item)
        return
      }

      await performDownload(item)
    } catch (downloadError) {
      setDownloadStatus('')
      setError(downloadError.message || 'Download failed')
    }
  }

  const handleNewFolder = () => {
    const folderName = `New Folder ${folders.length + 1}`
    setFolders((prev) => [
      {
        id: crypto.randomUUID(),
        name: folderName,
        createdAt: new Date().toISOString(),
        kind: 'folder',
      },
      ...prev,
    ])
  }

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  const usedBytes = files.filter((file) => !file.deleted).reduce((total, file) => total + Number(file.size || 0), 0)
  const totalBytes = 2 * 1024 ** 4
  const usagePercent = Math.min(100, Math.round((usedBytes / totalBytes) * 100))

  const visibleItems = useMemo(() => {
    const visibleFiles = files.filter((file) => {
      if (section === 'trash') return file.deleted
      if (section === 'starred') return file.starred && !file.deleted
      if (section === 'recent') return !file.deleted
      return !file.deleted
    })

    const includeFolders = section === 'drive'
    let base = includeFolders ? [...folders, ...visibleFiles] : visibleFiles

    if (includeFolders && currentFolderPath.length > 0) {
      const currentFolderId = currentFolderPath[currentFolderPath.length - 1]
      base = base.filter((item) => !item.parentId || item.parentId === currentFolderId || (item.kind === 'folder' && item.parentId === currentFolderId))
    } else if (includeFolders) {
      base = base.filter((item) => !item.parentId || item.parentId === 'root')
    }

    return base.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
  }, [files, folders, section, search, currentFolderPath])

  const openDockItem = (id) => {
    setActivePanel(id)
    if (id === 'pricing' || id === 'settings') return
    if (id === 'profile') {
      navigate('/profile')
      return
    }
    if (id === 'upload') {
      setShowUpload(true)
      return
    }
    setSection(id)
  }

  const handleDockClick = (id) => {
    setBouncingDock(id)
    openDockItem(id)
    window.setTimeout(() => setBouncingDock(''), 450)
  }

  const handleContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()

    const items = []

    if (section === 'trash') {
      items.push(
        { label: 'Restore', onClick: () => { handleRestore(selectedItem); closeContextMenu(); } },
        { label: 'Permanently Delete', onClick: () => { handlePermanentDelete(selectedItem); closeContextMenu(); } }
      )
    } else {
      items.push({ label: 'Create Folder', onClick: handleCreateFolder })
      if (selectedItem && selectedItem.kind === 'file') {
        items.push({ label: selectedItem.starred ? 'Unstar' : 'Star', onClick: () => { handleStar(selectedItem); closeContextMenu(); } })
      }
    }

    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      items,
    })
  }

  const handleCreateFolder = () => {
    setShowNewFolderDialog(true)
    setContextMenu({ open: false, x: 0, y: 0 })
    setTimeout(() => newFolderInputRef.current?.focus(), 0)
  }

  const handleNewFolderSubmit = async () => {
    if (!newFolderName.trim()) return

    const newFolder = {
      id: crypto.randomUUID(),
      name: newFolderName.trim(),
      createdAt: new Date().toISOString(),
      kind: 'folder',
      parentId: currentFolderPath[currentFolderPath.length - 1] || 'root',
    }


    try {
      const response = await createFolder({
        name: newFolderName.trim(),
        parentId: currentFolderPath[currentFolderPath.length - 1] || 'root',
      })

      const createdFolder = {
        id: response?.folderId || response?.id || newFolder.id,
        name: newFolderName.trim(),
        createdAt: new Date().toISOString(),
        kind: 'folder',
        parentId: currentFolderPath[currentFolderPath.length - 1] || 'root',
      }

      setFolders((prev) => [createdFolder, ...prev])
      setShowNewFolderDialog(false)
      setNewFolderName('')
    } catch (createError) {
      setError(createError.message || 'Failed to create folder')
    }
  }

  const handleOpenFolder = (folder) => {
    setCurrentFolderPath((prev) => [...prev, folder.id])
    setSelectedItem(null)
    setDetailPanelFile(null)
  }

  const handleBackFolder = () => {
    setCurrentFolderPath((prev) => prev.slice(0, -1))
    setSelectedItem(null)
    setDetailPanelFile(null)
  }

  const handleFileSelect = (item) => {
    if (item.kind === 'file') {
      setSelectedItem(item)
      setDetailPanelFile(item)
    }
  }

  const handleDelete = async (item) => {
    if (item.kind === 'folder') {
      try {
        await deleteFolder(item.id)
        setFolders((prev) => prev.filter((f) => f.id !== item.id))
      } catch (err) {
        setError(err.message || 'Failed to delete folder')
      }
    } else {
      try {
        await deleteFile(item.id)
        setFiles((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, deleted: true } : f))
        )
        if (detailPanelFile?.id === item.id) {
          setDetailPanelFile(null)
        }
      } catch (err) {
        setError(err.message || 'Failed to delete file')
      }
    }
  }

  const handleStar = async (item) => {
    try {
      if (item.starred) {
        await unstarFile(item.id)
      } else {
        await starFile(item.id)
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, starred: !f.starred } : f))
      )
      if (detailPanelFile?.id === item.id) {
        setDetailPanelFile((prev) => ({ ...prev, starred: !prev.starred }))
      }
    } catch (err) {
      setError(err.message || 'Failed to update star')
    }
  }

  const handleRestore = async (item) => {
    try {
      await restoreFile(item.id)
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, deleted: false } : f))
      )
      if (detailPanelFile?.id === item.id) {
        setDetailPanelFile((prev) => ({ ...prev, deleted: false }))
      }
    } catch (err) {
      setError(err.message || 'Failed to restore file')
    }
  }

  const handlePermanentDelete = async (item) => {
    try {
      await permanentlyDeleteFile(item.id)
      setFiles((prev) => prev.filter((f) => f.id !== item.id))
      if (detailPanelFile?.id === item.id) {
        setDetailPanelFile(null)
      }
    } catch (err) {
      setError(err.message || 'Failed to permanently delete file')
    }
  }

  const closeContextMenu = () => {
    setContextMenu({ open: false, x: 0, y: 0, items: [] })
  }

  return (
    <main className="finder-page">
      <section className="finder-shell">
        <header className="finder-toolbar">
          <div className="finder-nav">
            <button type="button" className={`toolbar-icon-button ${currentFolderPath.length === 0 ? 'is-disabled' : ''}`} onClick={handleBackFolder} aria-label="Back">
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="toolbar-icon-button is-disabled" aria-label="Forward">
              <ChevronRight size={18} />
            </button>
            <span className="toolbar-divider" />
            <div className="toolbar-breadcrumb">
              <span className="breadcrumb-active">
                {currentFolderPath.length === 0
                  ? 'My Drive'
                  : folders.find((f) => f.id === currentFolderPath[currentFolderPath.length - 1])?.name || 'Folder'}
              </span>
            </div>
          </div>

          <label className="search-pill">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
            />
          </label>

          <div className="toolbar-right">
            <button type="button" className="toolbar-icon-button">
              <FolderPlus size={18} />
            </button>
            <span className="toolbar-divider" />
            <div className="view-toggle-pill" role="group" aria-label="View mode">
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'grid' ? 'is-active' : ''}`.trim()}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'list' ? 'is-active' : ''}`.trim()}
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <List size={14} />
              </button>
            </div>
            <span className="toolbar-divider" />
            <button type="button" className="toolbar-icon-button">
              <Bell size={16} />
            </button>
          </div>
        </header>

        <div className="finder-body">
          <aside className="finder-sidebar">
            <div className="sidebar-section-label">FOLDERS</div>
            <button type="button" className={`sidebar-tree-item is-root ${section === 'drive' ? 'is-selected' : ''}`.trim()} onClick={() => setSection('drive')}>
              <span className="tree-chevron">⌄</span>
              <Folder size={16} />
              <span>My Drive</span>
            </button>
            <button type="button" className="sidebar-tree-item indent" onClick={() => setSection('drive')}>
              <span className="tree-chevron">›</span>
              <Folder size={16} />
              <span>Documents</span>
            </button>
            <button type="button" className="sidebar-tree-item indent" onClick={() => setSection('drive')}>
              <span className="tree-chevron">›</span>
              <Folder size={16} />
              <span>Design Files</span>
            </button>
            <button type="button" className="sidebar-tree-item" onClick={() => setSection('drive')}>
              <span className="tree-chevron">›</span>
              <Folder size={16} />
              <span>Video Renders</span>
            </button>
            <button type="button" className="sidebar-tree-item" onClick={() => setSection('drive')}>
              <span className="tree-chevron">›</span>
              <Folder size={16} />
              <span>Archive</span>
            </button>

            <div className="sidebar-divider" />

            <button type="button" className={`sidebar-link ${section === 'recent' ? 'is-selected' : ''}`.trim()} onClick={() => setSection('recent')}>
              <Clock3 size={16} />
              <span>Recent</span>
            </button>
            <button type="button" className={`sidebar-link ${section === 'starred' ? 'is-selected' : ''}`.trim()} onClick={() => setSection('starred')}>
              <Star size={16} />
              <span>Starred</span>
            </button>
            <button type="button" className={`sidebar-link ${section === 'trash' ? 'is-selected' : ''}`.trim()} onClick={() => setSection('trash')}>
              <Trash2 size={16} />
              <span>Trash</span>
            </button>

            <div className="sidebar-storage-box">
              <div className="sidebar-storage-label">
                <span>Storage</span>
                <span>1.2 / 2 TB</span>
              </div>
              <div className="sidebar-storage-track">
                <div className="sidebar-storage-fill" style={{ width: `${usagePercent}%` }} />
              </div>
              <div className="sidebar-storage-footer">5 items</div>
            </div>
          </aside>

          <section className="finder-main" ref={mainAreaRef} onContextMenu={handleContextMenu} onClick={closeContextMenu}>
            {error && (
              <div className="finder-banner">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            {downloadStatus && !error && (
              <div className="finder-banner finder-banner-muted">
                <AlertCircle size={14} />
                <span>{downloadStatus}</span>
              </div>
            )}

            <div className="finder-table-head">
              <span>
                <input type="checkbox" readOnly />
              </span>
              <span>NAME ↑</span>
              <span>TYPE</span>
              <span>SIZE</span>
              <span>DATE MODIFIED</span>
              <span>
                <Lock size={14} />
              </span>
              <span />
            </div>

            <div className={`finder-table ${loading ? 'is-loading' : ''}`.trim()}>
              {!error && visibleItems.length === 0 && !loading && (
                <div className="finder-empty">No items here.</div>
              )}

              {visibleItems.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  selected={selectedItem?.id === item.id}
                  onSelect={handleFileSelect}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onOpenFolder={handleOpenFolder}
                  onStar={handleStar}
                />
              ))}
            </div>

            <footer className="finder-footer">
              <span>
                <Lock size={12} /> E2E Encrypted
              </span>
              <span>{section === 'trash' ? 'Trash' : `${files.filter((file) => !file.deleted).length} items`}</span>
              <span>{formatSize(usedBytes)} / 2 TB</span>
            </footer>
          </section>


        </div>

        <footer className="finder-statusbar">
          <span>{section === 'trash' ? 'Trash' : `${files.filter((file) => !file.deleted).length} items`}</span>
          <span>
            <Lock size={12} /> E2E Encrypted
          </span>
          <span>{formatSize(usedBytes)} / 2 TB</span>
        </footer>
      </section>

      <footer className="finder-dock">
        {dockItems.map((item) => (
          <Fragment key={item.id}>
            {item.id === 'profile' && <span className="dock-separator" aria-hidden="true" />}
            <button
              type="button"
              className={`dock-app ${section === item.id || activePanel === item.id ? 'is-active' : ''} ${bouncingDock === item.id ? 'is-bouncing' : ''}`.trim()}
              onClick={() => handleDockClick(item.id)}
            >
              <span className="dock-app-tile" style={{ '--dock-gradient': dockGradients[item.id] }}>
                <span className="dock-icon-gloss" aria-hidden="true" />
                <DockGlyph id={item.id} />
              </span>
            </button>
          </Fragment>
        ))}
      </footer>

      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenu.items || []}
        onClose={closeContextMenu}
      />

      {showNewFolderDialog && (
        <div className="modal-overlay" onClick={() => setShowNewFolderDialog(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Folder</h2>
            </div>
            <div className="modal-content">
              <input
                ref={newFolderInputRef}
                type="text"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNewFolderSubmit()
                  if (e.key === 'Escape') setShowNewFolderDialog(false)
                }}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="modal-button-secondary" onClick={() => setShowNewFolderDialog(false)}>
                Cancel
              </button>
              <button type="button" className="modal-button-primary" onClick={handleNewFolderSubmit}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {detailPanelFile && (
        <div className="file-detail-modal">
          <div className="file-detail-modal-header">
            <h2>File Details</h2>
            <button type="button" className="file-detail-close" onClick={() => setDetailPanelFile(null)}>
              ✕
            </button>
          </div>
          <div className="file-detail-modal-content">
            <div className="file-detail-icon-large">
              {detailPanelFile.kind === 'folder' ? (
                <Folder size={64} strokeWidth={1.5} />
              ) : (() => {
                const Icon = getFileIcon(detailPanelFile.name)
                return <Icon size={64} strokeWidth={1.5} />
              })()}
            </div>
            <h3 className="file-detail-name">{detailPanelFile.name}</h3>
            <div className="file-detail-meta-row">
              <span className="file-detail-badge">{detailPanelFile.kind === 'folder' ? 'FOLDER' : getFileExtension(detailPanelFile.name).toUpperCase()}</span>
              {detailPanelFile.kind === 'file' && (
                <span className="file-detail-badge">{formatSize(detailPanelFile.size)}</span>
              )}
            </div>

            <div className="file-detail-section">
              <div className="file-detail-item">
                <span className="file-detail-label">Type</span>
                <span className="file-detail-value">{detailPanelFile.kind === 'folder' ? 'Folder' : getFileExtension(detailPanelFile.name).toUpperCase()}</span>
              </div>
              {detailPanelFile.kind === 'file' && (
                <div className="file-detail-item">
                  <span className="file-detail-label">Size</span>
                  <span className="file-detail-value">{formatSize(detailPanelFile.size)}</span>
                </div>
              )}
              <div className="file-detail-item">
                <span className="file-detail-label">Uploaded</span>
                <span className="file-detail-value">{formatDate(detailPanelFile.createdAt)}</span>
              </div>
            </div>

            {detailPanelFile.kind === 'file' && (
              <>
                <div className="file-detail-divider" />
                <div className="file-detail-section">
                  <div className="file-detail-item">
                    <span className="file-detail-label">Content Identifier (CID)</span>
                    <button type="button" className="file-detail-copy" onClick={() => navigator.clipboard.writeText(detailPanelFile.cid || '')}>
                      Copy
                    </button>
                  </div>
                  <div className="file-detail-cid-box">{detailPanelFile.cid || '--'}</div>
                  <div className="file-detail-item">
                    <span className="file-detail-label">Backed up</span>
                    <span className="file-detail-value">{detailPanelFile.filecoinBacked ? '✓ Yes' : 'No'}</span>
                  </div>
                </div>
              </>
            )}

            <div className="file-detail-actions">
              {detailPanelFile.kind === 'file' && (
                <button
                  type="button"
                  className="file-detail-button-secondary"
                  onClick={() => handleStar(detailPanelFile)}
                >
                  <Star size={16} fill={detailPanelFile.starred ? 'currentColor' : 'none'} />
                  {detailPanelFile.starred ? 'Unstar' : 'Star'}
                </button>
              )}
              {!detailPanelFile.deleted && detailPanelFile.kind === 'file' && (
                <button type="button" className="file-detail-button-primary" onClick={() => handleDownload(detailPanelFile)}>
                  <Download size={16} />
                  Download
                </button>
              )}
              {section === 'trash' && detailPanelFile.deleted && (
                <>
                  <button type="button" className="file-detail-button-primary" onClick={() => {
                    handleRestore(detailPanelFile)
                    setDetailPanelFile(null)
                  }}>
                    ↻ Restore
                  </button>
                  <button type="button" className="file-detail-button-danger" onClick={() => {
                    handlePermanentDelete(detailPanelFile)
                    setDetailPanelFile(null)
                  }}>
                    <Trash2 size={16} />
                    Delete Permanently
                  </button>
                </>
              )}
              {!detailPanelFile.deleted && (
                <button type="button" className="file-detail-button-danger" onClick={() => {
                  handleDelete(detailPanelFile)
                  setDetailPanelFile(null)
                }}>
                  <Trash2 size={16} />
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <UploadModal
        open={showUpload}
        selectedFile={uploadFile}
        loading={uploading}
        progress={uploadProgress}
        onSelectFile={setUploadFile}
        onUpload={handleUpload}
        onClose={() => setShowUpload(false)}
      />

      {pendingDownloadItem && (
        <PasswordPrompt
          onUnlock={handleUnlock}
          onCancel={() => {
            setPendingDownloadItem(null)
            setUnlockError('')
          }}
          error={unlockError}
          message="Re-enter your password to decrypt the file key before downloading."
        />
      )}

      {showKeyStoragePrompt && (
        <PasswordPrompt
          onUnlock={handleStoreFileKey}
          onCancel={() => {
            setShowKeyStoragePrompt(false)
            setPendingKeyStorageFileId(null)
            setPendingFileKey(null)
            setKeyStorageError('')
          }}
          error={keyStorageError}
          message="Enter your master password to save key securely:"
          title="Save File Key"
          isLoading={keyStorageLoading}
        />
      )}

      <MasterPasswordPromptModal
        open={showMasterPasswordPrompt}
        onSubmit={handleMasterPasswordSubmit}
        error={masterPasswordError}
        isLoading={false}
        title="Enter Your Master Password"
        message="Your master password is required to access your encrypted files in this session. It will not be stored."
      />
    </main>
  )
}
