import FileCard from './FileCard.jsx'

export default function FileGrid({ files, selectedFileId, onSelect, onContextMenu }) {
  return (
    <div className="file-grid">
      {files.map((file) => (
        <FileCard
          key={file.id}
          file={file}
          selected={selectedFileId === file.id}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  )
}
