import { useEffect, useMemo, useState } from 'react'
import DriveIcon from '../assets/icons/drive.svg'
import PricingIcon from '../assets/icons/pricing.svg'
import ProfileIcon from '../assets/icons/profile.svg'
import RecentIcon from '../assets/icons/recent.svg'
import SettingsIcon from '../assets/icons/settings.svg'
import StarredIcon from '../assets/icons/starred.svg'
import TrashIcon from '../assets/icons/trash.svg'

const items = [
  { id: 'drive', label: 'Drive', icon: DriveIcon },
  { id: 'recent', label: 'Recent', icon: RecentIcon },
  { id: 'starred', label: 'Starred', icon: StarredIcon },
  { id: 'trash', label: 'Trash', icon: TrashIcon },
  { id: 'pricing', label: 'Pricing', icon: PricingIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
]

function formatClock(date) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function Taskbar({ email, activeItem, onOpen }) {
  const [clock, setClock] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const interval = setInterval(() => {
      setClock(formatClock(new Date()))
    }, 60_000)

    return () => clearInterval(interval)
  }, [])

  const itemNodes = useMemo(
    () =>
      items.map((item) => (
        <button
          type="button"
          key={item.id}
          className={`taskbar-item ${activeItem === item.id ? 'is-active' : ''}`.trim()}
          onClick={() => onOpen(item.id)}
        >
          <img src={item.icon} alt="" className="taskbar-icon" />
          <span className="taskbar-label">{item.label}</span>
          {activeItem === item.id && <span className="taskbar-dot" />}
        </button>
      )),
    [activeItem, onOpen],
  )

  return (
    <footer className="taskbar">
      <div className="taskbar-side taskbar-email">{email}</div>
      <div className="taskbar-center">{itemNodes}</div>
      <div className="taskbar-side taskbar-clock">{clock}</div>
    </footer>
  )
}
