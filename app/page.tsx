import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/marketing/landing-page'
import { getPostLoginPath, getSessionProfile } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

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

  return <LandingPage />
}