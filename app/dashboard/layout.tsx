import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DashboardShell from './DashboardShell'
import { SubscriptionStatus } from '@/components/subscription-status'
import OwnerBanner from '@/components/owner-banner'

export async function generateMetadata() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      title: 'ServicePortal',
      icons: { icon: '/favicon.ico' }
    }
  }

  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, logo_url')
    .eq('user_id', user.id)
    .single()

  const companyName = settings?.company_name || 'ServicePortal'
  const logoUrl = settings?.logo_url

  return {
    title: `${companyName} | ServicePortal`,
    icons: {
      icon: logoUrl || '/favicon.ico',           // Use uploaded logo or fallback
    },
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch company settings for sidebar branding
  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, logo_url')
    .eq('user_id', user.id)
    .single()

  const companyName = settings?.company_name || 'ServicePortal'
  const logoUrl = settings?.logo_url

  return (
    <DashboardShell companyName={companyName} logoUrl={logoUrl} userEmail={user.email}>
      {/* Owner banner only appears in the normal dashboard.
          It is intentionally not rendered on /owner routes because
          those use a completely separate layout (app/owner/layout.tsx). */}
      <OwnerBanner />
      <SubscriptionStatus />
      {children}
    </DashboardShell>
  )
}
