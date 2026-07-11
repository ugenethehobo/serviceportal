'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { isValidNewPassword } from '@/lib/auth-password-reset'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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

  if (isCheckingSession) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <p className="text-center text-sm text-muted-foreground">Verifying your reset link…</p>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Link expired</h1>
            <p className="text-sm text-balance text-muted-foreground">
              This reset link is invalid or has expired. Request a new one to continue.
            </p>
          </div>
          <Field>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                window.location.href = '/login/forgot-password'
              }}
            >
              Request new reset link
            </Button>
            <FieldDescription className="text-center">
              <Link href="/login" className="underline underline-offset-4">
                Back to sign in
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    )
  }

  return (
    <form
      className={cn('flex flex-col gap-6', className)}
      onSubmit={(event) => void handleSubmit(event)}
      {...(props as React.ComponentProps<'form'>)}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Choose a new password</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter a new password for your account.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="new-password">New password</FieldLabel>
          <Input
            id="new-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
          <Input
            id="confirm-password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            disabled={isLoading}
            autoComplete="new-password"
          />
        </Field>

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <Field>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Update password'}
          </Button>
          <FieldDescription className="text-center">
            <Link href="/login" className="underline underline-offset-4">
              Back to sign in
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}