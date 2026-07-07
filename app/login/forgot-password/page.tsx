'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordResetAction } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    await requestPasswordResetAction(email)
    setSubmitted(true)
    setIsLoading(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 max-md:min-h-dvh max-md:items-start max-md:overflow-y-auto max-md:overscroll-y-contain max-md:px-4 max-md:py-6 max-md:pt-[max(1.5rem,env(safe-area-inset-top))] max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md max-md:shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold max-md:text-xl max-md:leading-tight">
            Reset your password
          </CardTitle>
          <CardDescription className="max-md:text-sm">
            {submitted
              ? 'If an account exists for that email, we sent a reset link.'
              : 'Enter your email and we will send you a link to choose a new password.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Check your inbox and spam folder. The link expires after a short time. You can
                request another link below if needed.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full max-md:min-h-11"
                onClick={() => setSubmitted(false)}
              >
                Send another link
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 max-md:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  className="max-md:min-h-11 max-md:text-base max-md:px-3"
                />
              </div>

              <Button
                type="submit"
                className="w-full max-md:min-h-11 max-md:text-sm"
                disabled={isLoading}
              >
                {isLoading ? 'Sending…' : 'Send reset link'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}