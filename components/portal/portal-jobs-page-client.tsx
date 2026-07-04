'use client'

import { useMemo, useState } from 'react'
import { PortalJobsList } from '@/components/portal/portal-jobs-list'
import { SearchBar } from '@/components/search-bar'
import { Card } from '@/components/ui/card'
import { matchesSearch } from '@/lib/search'
import { partitionPortalJobs, type PortalJob } from '@/lib/portal-jobs'

function filterJobs(jobs: PortalJob[], query: string) {
  return jobs.filter((job) =>
    matchesSearch(
      query,
      job.title,
      job.status,
      job.balanceDueFormatted,
      job.crew?.name || '',
      job.serviceAddress,
      job.status.replace('_', ' ')
    )
  )
}

function JobSection({
  title,
  subtitle,
  jobs,
  timezone,
  emptyMessage,
  highlight,
}: {
  title: string
  subtitle: string
  jobs: PortalJob[]
  timezone: string
  emptyMessage: string
  highlight?: boolean
}) {
  if (jobs.length === 0) return null

  return (
    <Card className={`shadow-sm ${highlight ? 'border-primary/30' : ''}`}>
      <div className="px-5 pt-5 pb-2 border-b">
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <PortalJobsList jobs={jobs} timezone={timezone} emptyMessage={emptyMessage} />
    </Card>
  )
}

export function PortalJobsPageClient({
  jobs,
  timezone,
}: {
  jobs: PortalJob[]
  timezone: string
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterJobs(jobs, query), [jobs, query])
  const { activeNow, comingUp, past } = useMemo(
    () => partitionPortalJobs(filtered),
    [filtered]
  )

  const noResults = jobs.length > 0 && filtered.length === 0

  return (
    <div className="flex flex-col gap-5 sm:gap-6 pb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Jobs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Arrival times, assigned crews, and one-tap payments for every visit.
        </p>
      </div>

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search by job, crew, or status..."
        className="max-w-md"
      />

      {noResults ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">No jobs match your search.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <JobSection
            title="Happening now"
            subtitle={
              activeNow.length > 0
                ? 'Your crew should be on site during the arrival window below'
                : 'No visits in progress'
            }
            jobs={activeNow}
            timezone={timezone}
            emptyMessage="Nothing in progress right now."
            highlight
          />

          <JobSection
            title="Coming up"
            subtitle={`${comingUp.length} scheduled ${comingUp.length === 1 ? 'visit' : 'visits'}`}
            jobs={comingUp}
            timezone={timezone}
            emptyMessage="No upcoming visits scheduled."
          />

          {past.length > 0 && (
            <JobSection
              title="Past visits"
              subtitle="Completed and previous jobs"
              jobs={past}
              timezone={timezone}
              emptyMessage="No past jobs."
            />
          )}
        </div>
      )}
    </div>
  )
}