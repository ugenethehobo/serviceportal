import { redirect } from 'next/navigation'
import { createSupabaseAdmin, getSessionProfile } from '@/lib/portal-auth'
import { PortalMessagesPageClient } from '@/components/portal/portal-messages-page-client'

export const dynamic = 'force-dynamic'

export default async function PortalMessagesPage() {
  const session = await getSessionProfile()

  if (!session || session.profile.role !== 'client' || !session.profile.client_id) {
    redirect('/login')
  }

  const admin = createSupabaseAdmin()
  const { data: client } = await admin
    .from('clients')
    .select('name, portal_enabled, company_id')
    .eq('id', session.profile.client_id)
    .single()

  if (!client?.portal_enabled) {
    redirect('/login')
  }

  let companyName = 'your service provider'
  if (client.company_id) {
    const { data: company } = await admin
      .from('companies')
      .select('name')
      .eq('id', client.company_id)
      .single()

    if (company?.name) {
      companyName = company.name
    }
  }

  return (
    <PortalMessagesPageClient
      clientName={client.name}
      companyName={companyName}
    />
  )
}