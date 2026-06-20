import { useState } from 'react'

interface ColumnInputProps {
  columns: string[]
  setColumns: React.Dispatch<React.SetStateAction<string[]>>
}

function ColumnInput({ columns, setColumns }: ColumnInputProps) {
  const [value, setValue] = useState('')

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    setColumns(prev => [...prev, trimmed])
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="w-full max-w-md mx-auto mt-2.5">
      {columns.length > 0 && (
        <ul className="mb-3 space-y-1.5 flex justify-center gap-2 items-center flex-wrap">
          {columns.map((col, i) => (
            <li
              key={`${col}-${i}`}
              className="flex items-center gap-2 px-2 py-2 rounded-lg text-sm font-medium
                         bg-[var(--accent-bg)] text-[var(--accent)] border border-[var(--accent-border)]"
            >
              <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full
                               bg-[var(--accent)] text-white text-xs">
                {i + 1}
              </span>
              {col}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a column..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-[var(--border)]
                     bg-[var(--bg)] text-[var(--text-h)] placeholder:text-[var(--text)]
                     focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]
                     transition-colors"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="px-5 py-2.5 rounded-lg font-semibold text-white
                     bg-[var(--accent)] hover:opacity-90 active:scale-[0.98]
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all duration-150 cursor-pointer"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export default ColumnInput
