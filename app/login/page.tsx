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
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Sign in to ServicePortal</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            New here?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Start a free trial
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}