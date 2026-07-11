'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitBetaAccessRequestAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'

type BetaAccessRequestDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BetaAccessRequestDialog({ open, onOpenChange }: BetaAccessRequestDialogProps) {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phone, setPhone] = useState('')
  const [teamSize, setTeamSize] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setFullName('')
    setEmail('')
    setCompanyName('')
    setPhone('')
    setTeamSize('')
    setMessage('')
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await submitBetaAccessRequestAction({
      fullName,
      email,
      companyName,
      phone: phone || undefined,
      teamSize: teamSize || undefined,
      message: message || undefined,
    })

    setIsSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    onOpenChange(false)
    resetForm()
    router.push('/beta-access/thank-you')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-[#FF4F00]/15">
            <Sparkles className="size-5 text-[#FF4F00]" />
          </div>
          <DialogTitle>Request beta access</DialogTitle>
          <DialogDescription>
            Tell us about your operation. We&apos;ll review your request and send an invitation code
            if you&apos;re a fit for the beta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="beta-full-name">Your name *</Label>
              <Input
                id="beta-full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jordan Smith"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="beta-email">Work email *</Label>
              <Input
                id="beta-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="beta-company">Company name *</Label>
              <Input
                id="beta-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Lawn Care"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beta-phone">Phone</Label>
              <Input
                id="beta-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beta-team-size">Team size</Label>
              <Input
                id="beta-team-size"
                value={teamSize}
                onChange={(e) => setTeamSize(e.target.value)}
                placeholder="e.g. 8 field techs"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="beta-message">Anything else?</Label>
              <Textarea
                id="beta-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What are you hoping to solve with ServicePortal?"
                rows={3}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#FF4F00] hover:bg-[#E64600] text-white"
            >
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              Submit request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}