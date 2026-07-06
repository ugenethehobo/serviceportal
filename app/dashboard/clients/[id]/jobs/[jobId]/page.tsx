import { getJobDetailPageAction } from '@/app/action'
import { JobDetailPageClient } from '@/components/dashboard/job-detail-page-client'

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>
}) {
  const { id: clientId, jobId } = await params
  const result = await getJobDetailPageAction(jobId, clientId)

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Job</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load job.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <JobDetailPageClient
      clientId={clientId}
      jobId={jobId}
      initialJob={result.data.job}
      initialCompanyTimezone={result.data.companyTimezone}
      initialUserRole={result.data.userRole}
      initialIsSoloBusiness={result.data.isSoloBusiness}
      initialSoloCrewId={result.data.soloCrewId}
      initialCompanyId={result.data.companyId}
    />
  )
}