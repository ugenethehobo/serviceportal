import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/marketing/landing-page'
import { SERVICE_PORTAL_VERSION } from '@/lib/landing-page-config'
import { getPostLoginPath, getSessionProfile } from '@/lib/portal-auth'
import { getPlatformPlanPricing } from '@/lib/platform-pricing-server'
import { isBetaReleaseMode } from '@/lib/platform-settings'
import { getPlatformReleaseMode } from '@/lib/platform-settings-server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const releaseMode = await getPlatformReleaseMode()
  const isBeta = isBetaReleaseMode(releaseMode)

  return {
    title: isBeta ? 'ServicePortal — Now in Beta' : 'ServicePortal — Field service management',
    description: isBeta
      ? `ServicePortal helps field service teams run jobs, crews, and billing in one place. Beta ${SERVICE_PORTAL_VERSION}.`
      : `ServicePortal helps field service teams run jobs, crews, and billing in one place. Start your free trial — v${SERVICE_PORTAL_VERSION}.`,
  }
}

export default async function HomePage() {
  const session = await getSessionProfile()

  if (session) {
    redirect(
      getPostLoginPath(
        session.profile.role,
        process.env.NEXT_PUBLIC_ADMIN_EMAIL,
        session.profile.email
      )
    )
  }

  const [plans, releaseMode] = await Promise.all([
    getPlatformPlanPricing(),
    getPlatformReleaseMode(),
  ])
  return <LandingPage plans={plans} releaseMode={releaseMode} />
}