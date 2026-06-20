import { useState, useRef, useCallback } from 'react'

export interface FileItem {
  file: File
  id: string
}

interface FileUploadProps {
  items: FileItem[]
  setItems: React.Dispatch<React.SetStateAction<FileItem[]>>
  accept?: string
  maxFiles?: number
  maxSizeMB?: number
}

const FILE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  pdf:  { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400' },
  doc:  { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
  docx: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
  xls:  { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400' },
  xlsx: { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400' },
  ppt:  { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400' },
  pptx: { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400' },
  jpg:  { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  jpeg: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  png:  { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  gif:  { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  svg:  { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  webp: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400' },
  zip:  { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' },
  rar:  { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' },
  '7z': { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' },
  txt:  { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' },
  csv:  { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-600 dark:text-cyan-400' },
  json: { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-600 dark:text-cyan-400' },
  xml:  { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-600 dark:text-cyan-400' },
  html: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-600 dark:text-amber-400' },
  css:  { bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-600 dark:text-sky-400' },
  js:   { bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-600 dark:text-yellow-400' },
  ts:   { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-400' },
}

function getExt(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function UploadIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
         stroke="var(--text)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
         stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function FileUpload({ items, setItems, accept, maxFiles = 10, maxSizeMB = 10 }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    let errorMsg: string | null = null

    if (items.length + fileArray.length > maxFiles) {
      errorMsg = `Maximum ${maxFiles} files allowed`
    }

    const validFiles: File[] = []
    for (const file of fileArray) {
      if (!errorMsg && file.size > maxSizeMB * 1024 * 1024) {
        errorMsg = `"${file.name}" exceeds ${maxSizeMB}MB limit`
        continue
      }
      if (items.some(i => i.file.name === file.name && i.file.size === file.size)) {
        continue
      }
      validFiles.push(file)
    }

    setError(errorMsg)

    if (validFiles.length > 0) {
      const newItems: FileItem[] = validFiles.map(file => ({
        file,
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }))
      setItems(prev => [...prev, ...newItems])
    }
  }, [items, setItems, maxFiles, maxSizeMB])

  const removeFile = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    setError(null)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragging(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
      e.target.value = ''
    }
  }

  const fileExtBadge = (ext: string) => {
    const colors = FILE_TYPE_COLORS[ext] || { bg: 'bg-gray-50 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400' }
    return (
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-xs font-semibold uppercase shrink-0 ${colors.bg} ${colors.text}`}>
        {ext.slice(0, 4)}
      </span>
    )
  }

  const dropZoneStyle = isDragging
    ? 'border-[var(--accent)] bg-[var(--accent-bg)] scale-[1.01] shadow-[var(--shadow)]'
    : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--accent-bg)]'

  return (
    <div className="w-full max-w-lg mx-auto mt-4">
      {/* Drop Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ease-out ${dropZoneStyle}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        role="button"
        tabIndex={0}
        aria-label="Upload files"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center gap-3">
          <UploadIcon />
          <div>
            <p className="text-[var(--text-h)] font-medium leading-snug">
              Drag & drop files here
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text)' }}>
              or click to browse
            </p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text)' }}>
            {accept ? `Accepted: ${accept.replace(/,/g, ', ')}` : 'All file types supported'}
            <span className="mx-1">&middot;</span>
            Up to {maxFiles} files, {maxSizeMB}MB each
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-3 px-4 py-2.5 rounded-lg text-sm font-medium
                        bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800
                        text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/* File List */}
      {items.length > 0 && (
        <>
          <div className="mt-5 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--text-h)]">
              {items.length} file{items.length > 1 ? 's' : ''} selected
            </p>
            <button
              type="button"
              onClick={() => { setItems([]); setError(null) }}
              className="text-xs font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              Clear all
            </button>
          </div>

          <ul className="mt-2 space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
            {items.map(item => {
              const ext = getExt(item.file.name)
              return (
                <li
                  key={item.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--code-bg)] group"
                >
                  {fileExtBadge(ext)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-h)] truncate">
                      {item.file.name}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text)' }}>
                      {formatSize(item.file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeFile(item.id) }}
                    className="p-1.5 rounded-md opacity-60 group-hover:opacity-100
                               text-[var(--text)] hover:text-red-500 hover:bg-red-50
                               dark:hover:bg-red-900/20 cursor-pointer transition-all"
                    title="Remove file"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <CloseIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

    </div>
  )
}

export default FileUpload
