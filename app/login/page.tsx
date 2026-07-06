'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
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

      // Hard navigation so auth cookies are sent; middleware routes by role.
      window.location.href = '/dashboard'
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during login')
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4 max-md:min-h-dvh max-md:items-start max-md:overflow-y-auto max-md:overscroll-y-contain max-md:px-4 max-md:py-6 max-md:pt-[max(1.5rem,env(safe-area-inset-top))] max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-md max-md:shadow-none">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold max-md:text-xl max-md:leading-tight">
            Sign in to ServicePortal
          </CardTitle>
          <CardDescription className="max-md:text-sm">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4 max-md:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="email"
                className="max-md:min-h-11 max-md:text-base max-md:px-3"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                autoComplete="current-password"
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
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground max-md:mt-8">
            New here?{' '}
            <Link
              href="/signup"
              className="font-medium text-primary hover:underline max-md:inline-block max-md:py-2"
            >
              Start a free trial
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}