'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isValidNewPassword } from '@/lib/auth-password-reset'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) {
        setHasSession(Boolean(data.session))
        setIsCheckingSession(false)
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!isValidNewPassword(password)) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        window.location.href = '/admin'
        return
      }

      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to update password')
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 max-md:min-h-dvh max-md:items-start max-md:overflow-y-auto max-md:overscroll-y-contain max-md:px-4 max-md:py-6 max-md:pt-[max(1.5rem,env(safe-area-inset-top))] max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md max-md:shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold max-md:text-xl max-md:leading-tight">
            Choose a new password
          </CardTitle>
          <CardDescription className="max-md:text-sm">
            Enter a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isCheckingSession ? (
            <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
          ) : !hasSession ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This reset link is invalid or has expired. Request a new one to continue.
              </p>
              <Button
                type="button"
                className="w-full max-md:min-h-11"
                onClick={() => {
                  window.location.href = '/login/forgot-password'
                }}
              >
                Request new reset link
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
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="max-md:min-h-11 max-md:text-base max-md:px-3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                  className="max-md:min-h-11 max-md:text-base max-md:px-3"
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full max-md:min-h-11 max-md:text-sm"
                disabled={isLoading}
              >
                {isLoading ? 'Saving…' : 'Update password'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}