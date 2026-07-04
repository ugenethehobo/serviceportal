import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPostLoginPath } from '@/lib/portal-auth'

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

  const isPublicMarketingRoute = pathname === '/' || pathname === '/signup'

  if (pathname === '/' && user) {
    const url = request.nextUrl.clone()
    const profile = await getProfileRole(user.id)
    url.pathname = getPostLoginPath(
      profile?.role || '',
      process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      user.email
    )
    return NextResponse.redirect(url)
  }

  if ((isStaffRoute || isPortalRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && (isStaffRoute || isPortalRoute || pathname === '/login' || isPublicMarketingRoute)) {
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

    if (
      isStaffRoute &&
      (pathname === '/dashboard/account' || pathname.startsWith('/dashboard/account/'))
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard/settings'
      url.searchParams.set('section', 'profile')
      return NextResponse.redirect(url)
    }

    if (pathname === '/login' || pathname === '/signup') {
      const url = request.nextUrl.clone()
      url.pathname = getPostLoginPath(
        role || '',
        process.env.NEXT_PUBLIC_ADMIN_EMAIL,
        user.email
      )
      return NextResponse.redirect(url)
    }

    if (isStaffRoute && role === 'team_member') {
      const isTeamHome = pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/')
      const isSettingsRoute =
        pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')
      const isAssignedJobRoute = /^\/dashboard\/clients\/[^/]+\/jobs\/[^/]+/.test(pathname)

      if (!isTeamHome && !isSettingsRoute && !isAssignedJobRoute) {
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