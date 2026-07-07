import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPostLoginPath } from '@/lib/portal-auth'
import { isDashboardPathAllowed } from '@/lib/platform-entitlements'
import {
  getCompanySubscriptionAccessForClient,
  getCompanySubscriptionAccessForCompany,
} from '@/lib/platform-trial-server'
import {
  getCachedClientCompanySubscriptionAccess,
  getCachedCompanySubscriptionAccess,
  setCachedClientCompanySubscriptionAccess,
  setCachedCompanySubscriptionAccess,
} from '@/lib/subscription-access-cache'

async function resolveCompanySubscriptionAccess(companyId: string) {
  const cached = getCachedCompanySubscriptionAccess(companyId)
  if (cached) return cached

  const access = await getCompanySubscriptionAccessForCompany(companyId)
  if (access) setCachedCompanySubscriptionAccess(companyId, access)
  return access
}

async function resolveClientSubscriptionAccess(clientId: string) {
  const cached = getCachedClientCompanySubscriptionAccess(clientId)
  if (cached) return cached

  const access = await getCompanySubscriptionAccessForClient(clientId)
  if (access) setCachedClientCompanySubscriptionAccess(clientId, access)
  return access
}

async function getProfileContext(userId: string) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role, client_id, company_id')
    .eq('id', userId)
    .single()

  return profile
}

async function getCompanyOnboardingCompleted(companyId: string): Promise<boolean | null> {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('onboarding_completed')
    .eq('id', companyId)
    .single()

  if (error) {
    if (error.code === '42703') return null
    return null
  }

  return data?.onboarding_completed ?? true
}

function isOnboardingRoute(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/')
}

function isStripeApiRoute(pathname: string) {
  return pathname.startsWith('/api/stripe/')
}

function isTrialGraceRoute(pathname: string, role: string | undefined) {
  if (pathname === '/dashboard/trial-expired') return true
  if (pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')) {
    return true
  }
  if (role === 'team_member' && (pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/'))) {
    return false
  }
  return false
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

  const pathname = request.nextUrl.pathname
  const protectedStaffRoutes = ['/dashboard', '/admin']
  const isStaffRoute = protectedStaffRoutes.some((route) => pathname.startsWith(route))
  const isPortalRoute = pathname.startsWith('/portal')
  const onboardingRoute = isOnboardingRoute(pathname)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let cachedProfile: Awaited<ReturnType<typeof getProfileContext>> | undefined
  const resolveProfile = async (userId: string) => {
    if (cachedProfile === undefined) {
      cachedProfile = await getProfileContext(userId)
    }
    return cachedProfile
  }

  const isPublicMarketingRoute = pathname === '/' || pathname === '/signup'

  if (pathname === '/' && user) {
    const url = request.nextUrl.clone()
    const profile = await resolveProfile(user.id)
    url.pathname = getPostLoginPath(
      profile?.role || '',
      process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      user.email
    )
    return NextResponse.redirect(url)
  }

  if ((isStaffRoute || isPortalRoute || onboardingRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (
    user &&
    (isStaffRoute || isPortalRoute || onboardingRoute || pathname === '/login' || isPublicMarketingRoute)
  ) {
    const profile = await resolveProfile(user.id)
    const role = profile?.role

    if (onboardingRoute) {
      if (role !== 'company_admin') {
        const url = request.nextUrl.clone()
        url.pathname = getPostLoginPath(
          role || '',
          process.env.NEXT_PUBLIC_ADMIN_EMAIL,
          user.email
        )
        return NextResponse.redirect(url)
      }

      if (profile?.company_id) {
        const onboardingCompleted = await getCompanyOnboardingCompleted(profile.company_id)
        if (onboardingCompleted === true) {
          const url = request.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
      }
    }

    if (
      isStaffRoute &&
      role === 'company_admin' &&
      profile?.company_id &&
      user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
      !isStripeApiRoute(pathname)
    ) {
      const onboardingCompleted = await getCompanyOnboardingCompleted(profile.company_id)
      if (onboardingCompleted === false) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return NextResponse.redirect(url)
      }
    }

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

    if (isStaffRoute && profile?.company_id && role !== undefined && user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
      const access = await resolveCompanySubscriptionAccess(profile.company_id)
      if (access && !access.hasAccess && !isTrialGraceRoute(pathname, role)) {
        const url = request.nextUrl.clone()
        if (role === 'company_admin') {
          url.pathname = '/dashboard/settings'
          url.searchParams.set('section', 'subscription')
          url.searchParams.set('trial', 'expired')
        } else {
          url.pathname = '/dashboard/trial-expired'
        }
        return NextResponse.redirect(url)
      }

      if (
        access?.hasAccess &&
        role === 'company_admin' &&
        !isDashboardPathAllowed(pathname, access.plan, request.nextUrl.searchParams)
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard/settings'
        url.searchParams.set('section', 'subscription')
        if (pathname.startsWith('/dashboard/routes')) {
          url.searchParams.set('upgrade', 'routes')
        } else if (pathname.startsWith('/dashboard/reports')) {
          url.searchParams.set('upgrade', 'reports')
        } else {
          url.searchParams.set('upgrade', 'integrations')
        }
        return NextResponse.redirect(url)
      }
    }

    if (isPortalRoute && role === 'client' && profile?.client_id) {
      const access = await resolveClientSubscriptionAccess(profile.client_id)
      if (access && !access.hasAccess) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'provider_unavailable')
        return NextResponse.redirect(url)
      }
    }

    if (isStaffRoute && role === 'team_member') {
      const isTeamHome = pathname === '/dashboard/team' || pathname.startsWith('/dashboard/team/')
      const isSettingsRoute =
        pathname === '/dashboard/settings' || pathname.startsWith('/dashboard/settings/')
      const isTrialExpiredRoute = pathname === '/dashboard/trial-expired'
      const isAssignedJobRoute = /^\/dashboard\/clients\/[^/]+\/jobs\/[^/]+/.test(pathname)

      if (!isTeamHome && !isSettingsRoute && !isTrialExpiredRoute && !isAssignedJobRoute) {
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