"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
  destructive?: boolean
  loading?: boolean
  children?: React.ReactNode // Optional extra content (e.g. warning notes)
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  loading = false,
  children,
}: ConfirmDialogProps) {
  const [isProcessing, setIsProcessing] = React.useState(false)

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      // Let the caller handle errors (they can show their own messaging)
      console.error(error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  const isBusy = loading || isProcessing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </div>

        {children}

        <div className="flex gap-3 pt-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCancel}
            disabled={isBusy}
          >
            {cancelLabel}
          </Button>
          <Button
            className={cn(
              "flex-1",
              destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            )}
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Optional: Simple one-button Alert variant for non-destructive info/warnings
interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  buttonLabel?: string
  onAction?: () => void
  children?: React.ReactNode
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  buttonLabel = "OK",
  onAction,
  children,
}: AlertDialogProps) {
  const handleAction = () => {
    onAction?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </div>

        {children}

        <div className="flex justify-end pt-4">
          <Button onClick={handleAction} className="min-w-[100px]">
            {buttonLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
