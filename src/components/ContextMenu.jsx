export default function ContextMenu({ open, x, y, items, onClose }) {
  if (!open) {
    return null
  }

  return (
    <>
      <button type="button" className="context-backdrop" onClick={onClose} aria-label="Close" />
      <div className="context-menu" style={{ left: x, top: y }}>
        {items.map((item, index) => {
          if (item.type === 'separator') {
            return <div key={`sep-${index}`} className="context-separator" />
          }

          return (
            <button key={item.label} type="button" className="context-item" onClick={item.onClick}>
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
