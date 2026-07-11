'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { submitBetaFeedbackAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { BETA_FEEDBACK_TYPES, type BetaFeedbackType } from '@/lib/beta-feedback'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Bug, Lightbulb, Loader2, MessageCircle, MessageSquareWarning } from 'lucide-react'
import { toast } from 'sonner'

const TYPE_ICONS = {
  bug: Bug,
  feature: Lightbulb,
  other: MessageCircle,
} as const

export function BetaFeedbackWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [feedbackType, setFeedbackType] = useState<BetaFeedbackType>('bug')
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [requiresEmail, setRequiresEmail] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    void submitBetaFeedbackAction({ preview: true }).then((result) => {
      if (result.success && result.mode === 'preview') {
        setRequiresEmail(result.requiresEmail)
        if (result.submitterEmail) {
          setContactEmail(result.submitterEmail)
        }
      }
    })
  }, [open])

  const resetForm = () => {
    setFeedbackType('bug')
    setMessage('')
    if (requiresEmail) {
      setContactEmail('')
    }
  }

  if (pathname === '/') {
    return null
  }

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Please describe your feedback')
      return
    }

    if (requiresEmail && !contactEmail.trim()) {
      toast.error('Please enter your email so we can follow up')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await submitBetaFeedbackAction({
        feedbackType,
        message: message.trim(),
        pageUrl: typeof window !== 'undefined' ? window.location.href : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        contactEmail: requiresEmail ? contactEmail.trim() : undefined,
      })

      if (!result.success) {
        toast.error(result.error || 'Could not send feedback')
        return
      }

      toast.success('Thanks! Your feedback was sent to the team.')
      resetForm()
      setOpen(false)
    } catch {
      toast.error('Could not send feedback')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Beta Feedback"
                className={cn(
                  'fixed bottom-5 right-5 z-[250] flex size-14 items-center justify-center rounded-full border-0',
                  'bg-primary text-primary-foreground shadow-lg',
                  'transition-transform hover:scale-105 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
              >
                <MessageSquareWarning className="size-6" />
              </button>
            }
          />
          <TooltipContent side="left">Beta Feedback</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) resetForm()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Beta feedback</DialogTitle>
            <DialogDescription>
              Report a bug, request a feature, or share anything else while we&apos;re in beta.
              Your current page is included automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label>What kind of feedback is this?</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {BETA_FEEDBACK_TYPES.map((option) => {
                  const Icon = TYPE_ICONS[option.value]
                  const selected = feedbackType === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFeedbackType(option.value)}
                      className={cn(
                        'rounded-lg border px-3 py-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50'
                      )}
                    >
                      <Icon className="mb-2 size-4" />
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="beta-feedback-message">Details</Label>
              <Textarea
                id="beta-feedback-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="What happened? What did you expect? Any steps to reproduce?"
                className="min-h-32"
                maxLength={8000}
              />
            </div>

            {requiresEmail && (
              <div className="space-y-2">
                <Label htmlFor="beta-feedback-email">Your email</Label>
                <Input
                  id="beta-feedback-email"
                  type="email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Send feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}