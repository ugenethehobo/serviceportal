'use client'

import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { FileText, UploadCloud, X } from 'lucide-react'

/** Must match CONTRACT_PDF_MAX_BYTES on the server. */
const MAX_BYTES = 10 * 1024 * 1024

type PdfDropZoneProps = {
  file: File | null
  onFileChange: (file: File | null) => void
  onError?: (message: string) => void
  disabled?: boolean
  className?: string
}

export function PdfDropZone({ file, onFileChange, onError, disabled, className }: PdfDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const accept = (candidate: File | undefined | null) => {
    if (!candidate) return
    const isPdf = candidate.type === 'application/pdf' || candidate.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      onError?.('Choose a PDF file')
      return
    }
    if (candidate.size > MAX_BYTES) {
      onError?.('PDF must be 10 MB or smaller')
      return
    }
    onFileChange(candidate)
  }

  if (file) {
    return (
      <div className={cn('flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5', className)}>
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button
          type="button"
          aria-label="Remove file"
          disabled={disabled}
          onClick={() => onFileChange(null)}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          accept(event.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:bg-muted/40',
          className
        )}
      >
        <UploadCloud className="size-7 text-muted-foreground" />
        <span className="text-sm font-medium">Drop a PDF here or click to browse</span>
        <span className="text-xs text-muted-foreground">Up to 10 MB and 40 pages</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          accept(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </>
  )
}
