import {
  Archive,
  Code,
  File,
  FileText,
  Image,
  Music,
  Video,
} from 'lucide-react'

const extMap = {
  txt: FileText,
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  webp: Image,
  mp3: Music,
  wav: Music,
  mp4: Video,
  mov: Video,
  zip: Archive,
  rar: Archive,
  js: Code,
  ts: Code,
  py: Code,
  html: Code,
}

export function getFileIcon(fileName = '') {
  const parts = fileName.toLowerCase().split('.')
  const ext = parts.length > 1 ? parts.pop() : ''

  return extMap[ext] || File
}

export function getFileExtension(fileName = '') {
  const parts = fileName.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop() : 'unknown'
}
