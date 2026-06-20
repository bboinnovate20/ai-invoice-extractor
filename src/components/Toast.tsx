import { useCallback, useState } from 'react'
import { ToastContext, type ToastItem, type ToastType } from './ToastContext.ts'

let nextId = 0

const STYLES: Record<ToastType, string> = {
  success: 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  error: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  info: 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent)]',
}

function ToastContainer({ toasts, remove }: { toasts: ToastItem[]; remove: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-sm font-medium
                     shadow-lg animate-[slideIn_0.3s_ease-out] ${STYLES[t.type]}`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => remove(t.id)}
            className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++
    setToasts(prev => [...prev.slice(-4), { id, message, type }])
    setTimeout(() => remove(id), 5000)
  }, [remove])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} remove={remove} />
    </ToastContext.Provider>
  )
}
