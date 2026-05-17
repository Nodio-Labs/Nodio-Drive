import { getFileIcon } from '../utils/fileIcons.js'

export default function FileCard({ file, selected, onSelect, onContextMenu }) {
  const Icon = getFileIcon(file.name)

  return (
    <button
      type="button"
      className={`file-card ${selected ? 'is-selected' : ''}`.trim()}
      onClick={() => onSelect(file)}
      onContextMenu={(event) => onContextMenu(event, file)}
    >
      <Icon size={32} strokeWidth={1.75} />
      <span className="file-name">{file.name}</span>
    </button>
  )
}
