import { getDashboardShellDataAction } from '@/app/action'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const shellResult = await getDashboardShellDataAction()
  const initialShellData = shellResult.success ? shellResult.data : null

  return (
    <DashboardShell initialShellData={initialShellData}>{children}</DashboardShell>
  )
}
