import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

async function getProfileRole(userId: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, client_id')
    .eq('id', userId)
    .single()

  return profile
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const protectedStaffRoutes = ['/dashboard', '/admin']
  const isStaffRoute = protectedStaffRoutes.some((route) => pathname.startsWith(route))
  const isPortalRoute = pathname.startsWith('/portal')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if ((isStaffRoute || isPortalRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (isStaffRoute || isPortalRoute || pathname === '/login')) {
    const profile = await getProfileRole(user.id)
    const role = profile?.role

    if (isPortalRoute && role !== 'client') {
      const url = request.nextUrl.clone()
      url.pathname = role === 'team_member' ? '/dashboard/team' : '/dashboard'
      return NextResponse.redirect(url)
    }

    if (isStaffRoute && role === 'client') {
      const url = request.nextUrl.clone()
      url.pathname = '/portal'
      return NextResponse.redirect(url)
    }

    if (pathname === '/login') {
      const url = request.nextUrl.clone()
      if (user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        url.pathname = '/admin'
      } else if (role === 'client') {
        url.pathname = '/portal'
      } else if (role === 'team_member') {
        url.pathname = '/dashboard/team'
      } else {
        url.pathname = '/dashboard'
      }
      return NextResponse.redirect(url)
    }

    if (isStaffRoute && role === 'team_member') {
      const isTeamHome = pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/')
      const isAssignedJobRoute = /^\/dashboard\/clients\/[^/]+\/jobs\/[^/]+/.test(pathname)

      if (!isTeamHome && !isAssignedJobRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard/team'
        return NextResponse.redirect(url)
      }
    }
  }

  if (pathname.startsWith('/admin') && user) {
    if (user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}