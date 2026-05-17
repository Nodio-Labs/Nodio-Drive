export default function Window({
  title,
  children,
  onClose,
  width,
  height,
  className = '',
}) {
  return (
    <section
      className={`window ${className}`.trim()}
      style={{ width, height }}
      role="dialog"
      aria-label={title}
    >
      <header className="window-titlebar">
        <button
          type="button"
          className="window-dot"
          aria-label="Close window"
          onClick={onClose}
        />
        <span className="window-dot" aria-hidden="true" />
        <span className="window-dot" aria-hidden="true" />
        <h2 className="window-title">{title}</h2>
      </header>
      <div className="window-content">{children}</div>
    </section>
  )
}
