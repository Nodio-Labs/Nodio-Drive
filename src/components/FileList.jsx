import { Check, X } from 'lucide-react'
import { formatDate } from '../utils/formatDate.js'
import { formatSize } from '../utils/formatSize.js'
import { getFileIcon } from '../utils/fileIcons.js'

export default function FileList({ files, selectedFileId, onSelect, onContextMenu }) {
  return (
    <div className="file-list-wrapper">
      <div className="file-list-header">
        <span>Type</span>
        <span>Name</span>
        <span>Size</span>
        <span>Date</span>
        <span>Filecoin</span>
      </div>
      {files.map((file) => {
        const Icon = getFileIcon(file.name)

        return (
          <button
            type="button"
            key={file.id}
            className={`file-list-row ${selectedFileId === file.id ? 'is-selected' : ''}`.trim()}
            onClick={() => onSelect(file)}
            onContextMenu={(event) => onContextMenu(event, file)}
          >
            <span>
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span>{file.name}</span>
            <span>{formatSize(file.size)}</span>
            <span>{formatDate(file.createdAt)}</span>
            <span className="filecoin-status">
              {file.filecoinBacked ? <Check size={14} /> : <X size={14} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
