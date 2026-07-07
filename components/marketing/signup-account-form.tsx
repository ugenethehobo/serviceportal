'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { completePlatformSignupAction } from '@/app/signup/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PlatformPlanId } from '@/lib/platform-billing'
import { Loader2 } from 'lucide-react'

interface SignupAccountFormProps {
  plan: PlatformPlanId
  checkoutSessionId?: string
  promoCode?: string
}

export function SignupAccountForm({ plan, checkoutSessionId, promoCode }: SignupAccountFormProps) {
  const supabase = createClient()
  const [companyName, setCompanyName] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await completePlatformSignupAction({
      plan,
      companyName,
      fullName,
      email,
      password,
      checkoutSessionId,
      promoCode,
    })

    if (!result.success) {
      setError(result.error)
      setIsSubmitting(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: result.email,
      password,
    })

    if (signInError) {
      setError(signInError.message || 'Account created but sign-in failed. Try logging in.')
      setIsSubmitting(false)
      return
    }

    window.location.href = '/onboarding'
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company-name">Company name</Label>
        <Input
          id="company-name"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Acme Lawn Care"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="full-name">Your name</Label>
        <Input
          id="full-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Smith"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">Work email</Label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={isSubmitting}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          required
          minLength={8}
          disabled={isSubmitting}
          autoComplete="new-password"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        {isSubmitting ? 'Creating your account…' : 'Create account & go to dashboard'}
      </Button>
    </form>
  )
}