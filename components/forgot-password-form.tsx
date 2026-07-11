'use client'

import Link from 'next/link'
import { useState } from 'react'
import { requestPasswordResetAction } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsLoading(true)
    await requestPasswordResetAction(email)
    setSubmitted(true)
    setIsLoading(false)
  }

  if (submitted) {
    return (
      <div className={cn('flex flex-col gap-6', className)} {...props}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Check your email</h1>
            <p className="text-sm text-balance text-muted-foreground">
              If an account exists for that email, we sent a reset link.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Check your inbox and spam folder. The link expires after a short time. You can
            request another link below if needed.
          </p>
          <Field>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setSubmitted(false)}
            >
              Send another link
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
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Enter your email and we will send you a link to choose a new password.
          </p>
        </div>

        <Field>
          <FieldLabel htmlFor="reset-email">Email</FieldLabel>
          <Input
            id="reset-email"
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
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Send reset link'}
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