'use client'

import { useMemo, useState } from 'react'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { PortalJobsList, type PortalJobListItem } from '@/components/portal/portal-jobs-list'
import { SearchBar } from '@/components/search-bar'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { matchesSearch } from '@/lib/search'

function partitionJobs(jobs: PortalJobListItem[]) {
  const now = Date.now()
  const upcoming: PortalJobListItem[] = []
  const past: PortalJobListItem[] = []

  for (const job of jobs) {
    const isPast =
      job.status === 'archived' ||
      job.status === 'cancelled' ||
      new Date(job.end_time).getTime() < now

    if (isPast) past.push(job)
    else upcoming.push(job)
  }

  return { upcoming, past }
}

function filterJobs(jobs: PortalJobListItem[], query: string) {
  return jobs.filter((job) =>
    matchesSearch(
      query,
      job.title,
      job.status,
      job.balanceDueFormatted,
      new Date(job.start_time).toLocaleString(),
      job.status.replace('_', ' ')
    )
  )
}

export function PortalJobsPageClient({ jobs }: { jobs: PortalJobListItem[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterJobs(jobs, query), [jobs, query])
  const { upcoming, past } = useMemo(() => partitionJobs(filtered), [filtered])

  const noResults = jobs.length > 0 && filtered.length === 0

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Jobs"
        description="Tap a job to see details. Jobs with a balance due can be paid right from this list."
      />

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search jobs by title, status, or date..."
        className="max-w-md shrink-0"
      />

      {noResults ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">No jobs match your search.</p>
        </Card>
      ) : (
        <>
          <Card className="shadow-sm flex flex-col min-h-0 flex-1">
            <div className="px-5 pt-5 pb-2 border-b shrink-0">
              <h2 className="font-semibold">Upcoming</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {upcoming.length} scheduled {upcoming.length === 1 ? 'job' : 'jobs'}
              </p>
            </div>
            <ScrollArea className="flex-1" viewportClassName="scroll-fade">
              <PortalJobsList jobs={upcoming} emptyMessage="No upcoming jobs scheduled." />
            </ScrollArea>
          </Card>

          {past.length > 0 && (
            <Card className="shadow-sm flex flex-col min-h-0 max-h-[45vh]">
              <div className="px-5 pt-5 pb-2 border-b shrink-0">
                <h2 className="font-semibold">History</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Completed and past jobs</p>
              </div>
              <ScrollArea className="flex-1" viewportClassName="scroll-fade">
                <PortalJobsList jobs={past} emptyMessage="No past jobs." />
              </ScrollArea>
            </Card>
          )}
        </>
      )}
    </div>
  )
}