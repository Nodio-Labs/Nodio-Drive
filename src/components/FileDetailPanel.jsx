import { Copy, Download, Trash2 } from 'lucide-react'
import { formatDate } from '../utils/formatDate.js'
import { formatSize } from '../utils/formatSize.js'
import { getFileExtension, getFileIcon } from '../utils/fileIcons.js'

export default function FileDetailPanel({ file, onDownload, onDelete, onCopyCid }) {
  const Icon = getFileIcon(file?.name || '')

  return (
    <aside className={`file-detail-panel ${file ? 'is-open' : ''}`.trim()}>
      {file && (
        <>
          <div className="file-detail-icon-wrap">
            <Icon size={48} strokeWidth={1.75} />
          </div>
          <h3 className="file-detail-title">{file.name}</h3>
          <div className="file-detail-divider" />
          <dl className="file-detail-meta">
            <div>
              <dt>Size</dt>
              <dd>{formatSize(file.size)}</dd>
            </div>
            <div>
              <dt>Uploaded</dt>
              <dd>{formatDate(file.createdAt)}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{getFileExtension(file.name)}</dd>
            </div>
          </dl>
          <div className="file-detail-divider" />
          <div className="file-detail-cid-row">
            <span className="file-detail-cid-label">Filecoin CID</span>
            <button type="button" onClick={() => onCopyCid(file.cid || '')}>
              <Copy size={14} />
            </button>
          </div>
          <p className="file-detail-cid">{file.cid || '--'}</p>
          <div className="file-detail-backed">Backed up: {file.filecoinBacked ? 'Yes' : 'No'}</div>
          <div className="file-detail-divider" />
          <button type="button" className="panel-button panel-primary" onClick={() => onDownload(file)}>
            <Download size={14} />
            Download
          </button>
          <button type="button" className="panel-button panel-ghost" onClick={() => onDelete(file)}>
            <Trash2 size={14} />
            Delete
          </button>
        </>
      )}
    </aside>
  )
}
