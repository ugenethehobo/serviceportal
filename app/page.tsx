import { redirect } from 'next/navigation'
import { getPostLoginPath, getSessionProfile } from '@/lib/portal-auth'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSessionProfile()

  if (!session) {
    redirect('/login')
  }

  redirect(
    getPostLoginPath(
      session.profile.role,
      process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      session.profile.email
    )
  )
}