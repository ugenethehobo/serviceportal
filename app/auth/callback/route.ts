import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createClient()

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Successfully exchanged the code for a session.
      // Redirect to the intended page (usually the dashboard for new users).
      return NextResponse.redirect(new URL(next, request.url))
    }

    console.error('Auth callback exchange error:', error)
  }

  // Something went wrong - send them to login with an error
  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
