import { Upload, X } from 'lucide-react'
import { formatSize } from '../utils/formatSize.js'

export default function UploadModal({
  open,
  selectedFile,
  loading,
  progress,
  onSelectFile,
  onUpload,
  onClose,
}) {
  if (!open) {
    return null
  }

  return (
    <div className="overlay">
      <section className="modal">
        <header className="modal-header">
          <h3>Upload file</h3>
          <button type="button" onClick={onClose}>
            <X size={14} />
          </button>
        </header>

        <label className="upload-dropzone" htmlFor="upload-file-input">
          <Upload size={20} />
          <span>{selectedFile ? selectedFile.name : 'Choose encrypted file source'}</span>
          <small>{selectedFile ? formatSize(selectedFile.size) : 'No file selected'}</small>
        </label>

        <input
          id="upload-file-input"
          type="file"
          className="hidden-input"
          onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
        />

        {loading && (
          <div className="upload-progress">
            <div className="upload-progress-track">
              <div className="upload-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span>{progress}%</span>
          </div>
        )}

        <button
          type="button"
          className="primary-button"
          onClick={onUpload}
          disabled={!selectedFile || loading}
        >
          {loading ? 'Encrypting...' : 'Upload'}
        </button>
      </section>
    </div>
  )
}
