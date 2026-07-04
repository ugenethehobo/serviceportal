'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isImageDocument,
  isPdfDocument,
  isPreviewableDocument,
} from '@/lib/uploaded-documents'
import { cn } from '@/lib/utils'
import { Download, ExternalLink, X } from 'lucide-react'
import { toast } from 'sonner'

export type DocumentViewerTarget = {
  id: string
  name: string
  file_name?: string | null
  file_type: string
  notes?: string | null
}

function getViewerDisplayName(document: DocumentViewerTarget) {
  return document.notes?.trim() || document.file_name || document.name
}

interface DocumentViewerDialogProps {
  document: DocumentViewerTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DocumentViewerDialog({
  document,
  open,
  onOpenChange,
}: DocumentViewerDialogProps) {
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayName = document ? getViewerDisplayName(document) : ''
  const canPreview = document ? isPreviewableDocument(document.file_type) : false

  const loadViewUrl = useCallback(async () => {
    if (!document) return
    setIsLoading(true)
    setError(null)
    setViewUrl(null)

    try {
      const response = await fetch(`/api/documents/${document.id}/view`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Could not load document')
      }
      setViewUrl(data.url)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not load document'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [document])

  useEffect(() => {
    if (open && document) {
      void loadViewUrl()
    } else {
      setViewUrl(null)
      setError(null)
      setIsLoading(false)
    }
  }, [open, document, loadViewUrl])

  const handleDownload = () => {
    if (!document) return
    window.open(`/api/documents/${document.id}/download`, '_blank')
  }

  const handleOpenNewTab = () => {
    if (viewUrl) {
      window.open(viewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          '!fixed !inset-3 sm:!inset-5 !top-3 !left-3 sm:!top-5 sm:!left-5',
          '!translate-x-0 !translate-y-0',
          '!w-[calc(100%-1.5rem)] !h-[calc(100%-1.5rem)] sm:!w-[calc(100%-2.5rem)] sm:!h-[calc(100%-2.5rem)]',
          '!max-w-none flex flex-col gap-0 p-0 overflow-hidden rounded-xl'
        )}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0 bg-background">
          <DialogTitle className="flex-1 min-w-0 text-sm font-semibold truncate pr-2">
            {displayName}
          </DialogTitle>
          <div className="flex items-center gap-1 shrink-0">
            {viewUrl && (
              <Button type="button" variant="ghost" size="icon-sm" onClick={handleOpenNewTab}>
                <ExternalLink className="size-4" />
                <span className="sr-only">Open in new tab</span>
              </Button>
            )}
            <Button type="button" variant="ghost" size="icon-sm" onClick={handleDownload}>
              <Download className="size-4" />
              <span className="sr-only">Download</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-muted/30 relative">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-[70%] w-full max-w-3xl rounded-lg" />
            </div>
          )}

          {!isLoading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md">{error}</p>
              <Button type="button" variant="outline" onClick={() => void loadViewUrl()}>
                Try again
              </Button>
            </div>
          )}

          {!isLoading && !error && viewUrl && document && canPreview && (
            <>
              {isPdfDocument(document.file_type) || document.file_type === 'text/plain' ? (
                <iframe
                  title={displayName}
                  src={viewUrl}
                  className="absolute inset-0 h-full w-full border-0 bg-background"
                />
              ) : isImageDocument(document.file_type) ? (
                <div className="absolute inset-0 flex items-center justify-center p-4 overflow-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewUrl}
                    alt={displayName}
                    className="max-h-full max-w-full object-contain rounded-md shadow-sm"
                  />
                </div>
              ) : null}
            </>
          )}

          {!isLoading && !error && viewUrl && document && !canPreview && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                This file type cannot be previewed in the browser. Download it to open locally.
              </p>
              <Button type="button" onClick={handleDownload}>
                <Download className="size-4" />
                Download file
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}