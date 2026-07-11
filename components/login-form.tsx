'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { BetaAccessRequestDialog } from '@/components/marketing/beta-access-request-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  reset_link_expired:
    'That password reset link has expired. Use Forgot password? to request a new one.',
  provider_unavailable:
    "Your service provider's portal is temporarily unavailable. Try again later or contact them directly.",
}

type LoginFormProps = React.ComponentProps<'form'> & {
  isBeta?: boolean
}

export function LoginForm({
  className,
  isBeta = false,
  ...props
}: LoginFormProps) {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [betaRequestOpen, setBetaRequestOpen] = useState(false)
  const queryError = searchParams.get('error')
  const bannerMessage = queryError ? LOGIN_ERROR_MESSAGES[queryError] : null
  const displayError = error || bannerMessage

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const trimmedEmail = email.trim()
      if (!trimmedEmail || !password) {
        throw new Error('Email and password are required')
      }

      let authData = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (authData.error?.message?.toLowerCase().includes('invalid')) {
        const lowerEmail = trimmedEmail.toLowerCase()
        if (lowerEmail !== trimmedEmail) {
          authData = await supabase.auth.signInWithPassword({
            email: lowerEmail,
            password,
          })
        }
      }

      if (authData.error) throw authData.error
      if (!authData.data.user) throw new Error('Login failed')

      const userEmail = authData.data.user.email

      if (userEmail === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        window.location.href = '/admin'
        return
      }

      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during login')
      setIsLoading(false)
    }
  }

  return (
    <>
      <form
        className={cn('flex flex-col gap-6', className)}
        onSubmit={(event) => void handleLogin(event)}
        {...props}
      >
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Login to your account</h1>
            <p className="text-sm text-balance text-muted-foreground">
              Enter your email below to login to your account
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={isLoading}
              autoComplete="current-password"
            />
            <Link
              href="/login/forgot-password"
              className="text-sm underline-offset-4 hover:underline"
            >
              Forgot your password?
            </Link>
          </Field>

          {displayError ? (
            <p className="text-sm text-destructive" role="alert">
              {displayError}
            </p>
          ) : null}

          <Field>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in…' : 'Login'}
            </Button>
          </Field>

          <Field>
            {isBeta ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setBetaRequestOpen(true)}
              >
                Request free beta access
              </Button>
            ) : (
              <Link
                href="/signup?plan=trial"
                className={cn(buttonVariants({ variant: 'outline' }), 'w-full')}
              >
                Start a free trial
              </Link>
            )}
            <FieldDescription className="text-center">
              {isBeta ? (
                <>
                  Have an invitation code?{' '}
                  <Link href="/signup" className="underline underline-offset-4">
                    Enter beta code
                  </Link>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <Link href="/signup?plan=trial" className="underline underline-offset-4">
                    Sign up
                  </Link>
                </>
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>

      {isBeta && (
        <BetaAccessRequestDialog open={betaRequestOpen} onOpenChange={setBetaRequestOpen} />
      )}
    </>
  )
}