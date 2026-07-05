'use client'

import { useState } from 'react'
import { validatePlatformPromoAction } from '@/app/signup/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PlatformPlanId } from '@/lib/platform-billing'
import { promoAppliedLabel } from '@/lib/platform-promo'
import { Loader2, Ticket } from 'lucide-react'

interface SignupPromoCodeProps {
  plan: Exclude<PlatformPlanId, 'trial'>
  isApplied: boolean
  onApplied: (code: string) => void
  onClear: () => void
}

export function SignupPromoCode({ plan, isApplied, onApplied, onClear }: SignupPromoCodeProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)

  const handleApply = async () => {
    setError(null)
    setIsApplying(true)

    const result = await validatePlatformPromoAction(code, plan)
    if (!result.success) {
      setError(result.error)
      setIsApplying(false)
      return
    }

    const trimmed = code.trim()
    onApplied(trimmed)
    setCode('')
    setIsApplying(false)
  }

  if (isApplied) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Ticket className="size-4 text-emerald-600" />
            <span className="font-medium text-sm">{promoAppliedLabel()}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Dev access enabled — skip payment and create your account.
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Remove
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <Label htmlFor="signup-promo-code" className="text-sm font-medium">
          Promo code
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Have a dev code? Apply it to use the product free on this plan.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id="signup-promo-code"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter promo code"
          disabled={isApplying}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleApply()
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleApply()}
          disabled={isApplying || !code.trim()}
          className="sm:shrink-0"
        >
          {isApplying && <Loader2 className="size-4 animate-spin" />}
          Apply code
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}