import { redirect } from 'next/navigation'
import { getSessionProfile, createSupabaseAdmin } from '@/lib/portal-auth'
import { PortalSidebar } from '@/components/portal/portal-sidebar'
import { PortalScrollMain } from '@/components/portal/portal-scroll-main'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionProfile()

  if (!session || session.profile.role !== 'client' || !session.profile.client_id) {
    redirect('/login')
  }

  const admin = createSupabaseAdmin()
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('portal_enabled, name, auth_user_id, company_id')
    .eq('id', session.profile.client_id)
    .single()

  if (clientError || !client) {
    redirect('/login')
  }

  if (client.portal_enabled === false) {
    redirect('/login')
  }

  if (client.auth_user_id && client.auth_user_id !== session.userId) {
    redirect('/login')
  }

  if (!client.auth_user_id) {
    await admin
      .from('clients')
      .update({ auth_user_id: session.userId, portal_enabled: true })
      .eq('id', session.profile.client_id)
  }

  let companyName = 'Your service provider'
  let companyLogo: string | null = null

  if (client.company_id) {
    const { data: company } = await admin
      .from('companies')
      .select('name, logo_url')
      .eq('id', client.company_id)
      .single()

    if (company?.name) companyName = company.name
    companyLogo = company?.logo_url ?? null
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <PortalSidebar
        clientName={client.name}
        companyName={companyName}
        companyLogo={companyLogo}
      />
      <PortalScrollMain>
        <div className="h-full p-6 flex flex-col min-h-0">{children}</div>
      </PortalScrollMain>
    </div>
  )
}