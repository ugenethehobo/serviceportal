'use client'

import { useState } from 'react'
import { validatePlatformBetaAccessAction } from '@/app/signup/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { betaAccessAppliedLabel } from '@/lib/platform-beta-access'
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react'

interface SignupBetaAccessCodeProps {
  isApplied: boolean
  onApplied: (code: string) => void
  onClear: () => void
}

export function SignupBetaAccessCode({
  isApplied,
  onApplied,
  onClear,
}: SignupBetaAccessCodeProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const handleApply = async () => {
    setError(null)
    setIsApplying(true)

    const result = await validatePlatformBetaAccessAction(code)
    if (!result.success) {
      setError(result.error)
      setIsApplying(false)
      return
    }

    onApplied(code.trim())
    setCode('')
    setIsApplying(false)
  }

  if (isApplied) {
    return (
      <div className="rounded-xl border border-[#FF4F00]/30 bg-[#FF4F00]/5 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-[#FF4F00]" />
              <span className="font-semibold">{betaAccessAppliedLabel()}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;re cleared for <span className="font-medium text-foreground">Pro</span> during
              the beta — continue to create your account.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Remove
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[#FF4F00]/25 bg-[#FF4F00]/[0.04] p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#FF4F00]/15">
          <KeyRound className="size-5 text-[#FF4F00]" />
        </div>
        <div>
          <Label htmlFor="beta-access-code" className="text-base font-semibold">
            Beta access code
          </Label>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the invitation code we sent you. Beta access unlocks the Pro tier.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="beta-access-code"
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Your beta invitation code"
          disabled={isApplying}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tracking-wide sm:flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleApply()
            }
          }}
        />
        <Button
          type="button"
          className="bg-[#FF4F00] hover:bg-[#E64600] text-white sm:shrink-0"
          onClick={() => void handleApply()}
          disabled={isApplying || !code.trim()}
        >
          {isApplying && <Loader2 className="size-4 animate-spin" />}
          Verify code
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}