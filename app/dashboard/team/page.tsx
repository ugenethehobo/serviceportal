import { getTeamMemberDashboardAction } from '@/app/action'
import { TeamPageClient } from '@/components/dashboard/team-page-client'

export const dynamic = 'force-dynamic'

export default async function TeamMemberDashboardPage() {
  const result = await getTeamMemberDashboardAction()

  if (!result.success) {
    return (
      <div className="p-6">
        <CardMessage>{result.error || 'Unable to load your schedule.'}</CardMessage>
      </div>
    )
  }

  return <TeamPageClient initialData={result.data} />
}

function CardMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}