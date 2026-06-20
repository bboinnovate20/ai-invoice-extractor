import { useCallback, useState } from 'react'
import FileUpload, { type FileItem } from './components/FileUpload.tsx'
// import { configureS3FromEnv, uploadMultipleToS3, type UploadResult } from './services/s3.ts'
import './App.css'
import ColumnInput from './components/ColumnInput.tsx'
import { useToast } from './components/ToastContext.ts'
import { processTextBatch } from './services/process.ts'
import { ocrFiles, ocrFilesIndividual } from './services/ocr.ts'

function initS3(): boolean {
  try {
    // configureS3FromEnv()
    return true
  } catch {
    console.warn('S3 not configured. Set VITE_AWS_* environment variables in .env')
    return false
  }
}

function App() {
  const toast = useToast()
  // const [uploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [items, setItems] = useState<FileItem[]>([])
  const [s3Ready] = useState(initS3)

  // const handleUpload = useCallback(async (files: File[]): Promise<UploadResult[]> => {
  //   setUploading(true)

  //   const { uploaded, errors } = await uploadMultipleToS3(files, {
  //     keyPrefix: 'uploads',
  //     ttl: 3600,
  //   })

  //   if (errors.length > 0) {
  //     errors.forEach(e => toast(`${e.fileName}: ${e.error}`, 'error'))
  //     setUploading(false)
  //     return []
  //   }

  //   setUploading(false)
  //   return uploaded
  // }, [toast])

  // const handleUploadClick = useCallback((files: File[]) => {
  //   handleUpload(files)
  // }, [handleUpload])

  const handleSubmit = useCallback(async () => {
    if (columns.length === 0) {
      toast('Please add at least one column', 'error')
      return
    }
    if (items.length === 0) {
      toast('Add at least one file', 'error')
      return
    }

    setLoading(true)
    setLoadingMessage('Extracting invoice 1...')
    const files = items.map(item => item.file)

    try {
      if (files.length > 20) {
        const texts = await ocrFilesIndividual(files, (current, total) => {
          setLoadingMessage(`Extracting invoice ${current} of ${total}...`)
        })
        setLoadingMessage('Processing text to Excel...')
        const { message } = await processTextBatch({
          columns,
          texts,
        })
        toast(message, 'success')
      } else {
        const text = await ocrFiles(files, (current, total) => {
          setLoadingMessage(`Extracting invoice ${current} of ${total}...`)
        })
        setLoadingMessage('Processing text to Excel...')
        const { message } = await processTextBatch({
          columns,
          texts: [text],
        })
        toast(message, 'success')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Extraction failed', 'error')
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }, [columns, toast, items])

  return (
    <div className="flex flex-col items-center justify-center min-h-[80svh] px-4">
      <h1>Extract Your Invoice Documents</h1>
      <h3>Convert your files into structured data in excel</h3>
      <p className="mb-8">Select and upload your business documents</p>

      {!s3Ready && (
        <div className="mb-4 px-4 py-2 rounded-lg text-sm font-medium
                        bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800
                        text-amber-600 dark:text-amber-400">
          S3 not configured. Copy .env.example to .env with your credentials.
        </div>
      )}

      <FileUpload
        items={items}
        setItems={setItems}
        accept=".pdf"
        maxFiles={100}
        maxSizeMB={10}
      />

      {loading && (
        <p className="mt-4 text-sm text-[var(--accent)] font-medium animate-pulse">
          Uploading...
        </p>
      )}
      <ColumnInput columns={columns} setColumns={setColumns}/>

      {(
        <button
          type="button"
          disabled={items.length === 0 || columns.length === 0 || loading}
          onClick={() => handleSubmit()}
          className="mt-6 w-full max-w-lg py-3 px-6 rounded-lg font-semibold text-white
                     bg-[var(--accent)] hover:opacity-90 active:scale-[0.98]
                     transition-all duration-150 cursor-pointer disabled:bg-gray-300
                     inline-flex items-center justify-center"
        >
          {( loading) && (
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          { loading ? "Extracting" : "Extract Data"}
        </button>
      )}

      {( loading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-xl bg-white dark:bg-[#1f2028] shadow-2xl">
            <svg className="animate-spin h-8 w-8 text-[var(--accent)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-medium text-[var(--text-h)]">
              {loadingMessage || ( 'Extracting data...')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
