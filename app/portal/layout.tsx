import { redirect } from 'next/navigation'
import { getPortalShellDataAction } from '@/lib/portal-auth'
import { PortalShell } from '@/components/portal/portal-shell'

export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const result = await getPortalShellDataAction()

  if (!result.success) {
    redirect('/login')
  }

  return <PortalShell shellData={result.data}>{children}</PortalShell>
}