import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface SaveStatusBadgeProps {
  status: SaveStatus
  message?: string
  className?: string
}

export function SaveStatusBadge({ status, message, className }: SaveStatusBadgeProps) {
  if (status === 'idle' && !message) return null

  return (
    <div className={cn('flex items-center gap-1.5 text-xs shrink-0', className)}>
      {status === 'saving' && (
        <>
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className="size-3.5 text-green-600" />
          <span className="text-green-600">Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="size-3.5 text-red-600" />
          <span className="text-red-600 max-w-[200px] truncate" title={message}>
            {message || 'Could not save'}
          </span>
        </>
      )}
      {status === 'idle' && message && (
        <span className="text-muted-foreground">{message}</span>
      )}
    </div>
  )
}