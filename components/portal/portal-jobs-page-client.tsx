'use client'

import { useMemo, useState } from 'react'
import { PortalJobsList } from '@/components/portal/portal-jobs-list'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { usePortalCrewTerminology } from '@/components/portal/portal-shell-context'
import { SearchBar } from '@/components/search-bar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { matchesSearch } from '@/lib/search'
import {
  partitionPortalJobs,
  portalDueNowLabel,
  type PortalJob,
} from '@/lib/portal-jobs'
import { cn } from '@/lib/utils'

type JobsFilter = 'all' | 'due' | 'upcoming' | 'past'

function filterJobs(jobs: PortalJob[], query: string) {
  return jobs.filter((job) =>
    matchesSearch(
      query,
      job.title,
      job.status,
      job.balanceDueFormatted,
      job.amountDueNowFormatted,
      job.crew?.name || '',
      job.serviceAddress,
      job.status.replace('_', ' '),
      portalDueNowLabel(job) || '',
      job.planType || '',
      ...(job.installments || []).map((i) => i.label)
    )
  )
}

const FILTERS: { id: JobsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'due', label: 'Due now' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
]

export function PortalJobsPageClient({
  jobs,
  timezone,
}: {
  jobs: PortalJob[]
  timezone: string
}) {
  const terms = usePortalCrewTerminology()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<JobsFilter>('all')

  const filtered = useMemo(() => filterJobs(jobs, query), [jobs, query])
  const { activeNow, comingUp, past } = useMemo(
    () => partitionPortalJobs(filtered),
    [filtered]
  )
  const dueNow = useMemo(
    () => filtered.filter((job) => job.canPay && job.amountDueNow > 0),
    [filtered]
  )

  const counts = useMemo(
    () => ({
      all: filtered.length,
      due: dueNow.length,
      upcoming: activeNow.length + comingUp.length,
      past: past.length,
    }),
    [filtered.length, dueNow.length, activeNow.length, comingUp.length, past.length]
  )

  const visibleSections = useMemo(() => {
    if (filter === 'due') {
      return [
        {
          key: 'due',
          title: 'Ready to pay',
          subtitle:
            dueNow.length > 0
              ? 'Installments and balances you can pay now'
              : 'Nothing collectible right now',
          jobs: dueNow,
          empty: 'No payments due right now.',
          highlight: true,
        },
      ]
    }
    if (filter === 'upcoming') {
      const sections = [
        {
          key: 'active',
          title: 'Happening now',
          subtitle: `${terms.singular} on site or in the arrival window`,
          jobs: activeNow,
          empty: 'Nothing in progress.',
          highlight: true,
        },
        {
          key: 'coming',
          title: 'Coming up',
          subtitle: 'Scheduled visits',
          jobs: comingUp,
          empty: 'No upcoming visits.',
          highlight: false,
        },
      ].filter((section) => section.jobs.length > 0)
      if (sections.length === 0) {
        return [
          {
            key: 'upcoming-empty',
            title: 'Upcoming',
            subtitle: 'Scheduled and in-progress visits',
            jobs: [] as PortalJob[],
            empty: 'No upcoming visits right now.',
            highlight: false,
          },
        ]
      }
      return sections
    }
    if (filter === 'past') {
      return [
        {
          key: 'past',
          title: 'Past visits',
          subtitle: 'Completed and previous jobs',
          jobs: past,
          empty: 'No past visits yet.',
          highlight: false,
        },
      ]
    }

    // all
    return [
      {
        key: 'active',
        title: 'Happening now',
        subtitle: `Your ${terms.singularLower} should be on site during the arrival window`,
        jobs: activeNow,
        empty: '',
        highlight: true,
      },
      {
        key: 'due',
        title: 'Ready to pay',
        subtitle: 'Payment plan installments and balances due now',
        jobs: dueNow.filter((j) => !activeNow.some((a) => a.id === j.id)),
        empty: '',
        highlight: false,
      },
      {
        key: 'coming',
        title: 'Coming up',
        subtitle: `${comingUp.length} scheduled ${comingUp.length === 1 ? 'visit' : 'visits'}`,
        jobs: comingUp,
        empty: '',
        highlight: false,
      },
      {
        key: 'past',
        title: 'Past visits',
        subtitle: 'Completed and previous jobs',
        jobs: past,
        empty: '',
        highlight: false,
      },
    ].filter((section) => section.jobs.length > 0)
  }, [filter, activeNow, comingUp, past, dueNow, terms.singular, terms.singularLower])

  const noResults = jobs.length > 0 && filtered.length === 0
  const emptyAll = jobs.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 pb-6 sm:gap-6">
      <PortalPageHeader
        title="Jobs"
        description={`Every visit in one place — schedule, ${terms.singularLower}, payment plans, and pay when ready.`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={`Search jobs, ${terms.singularLower}, or installment…`}
          className="w-full sm:max-w-md"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const count = counts[item.id]
            const active = filter === item.id
            return (
              <Button
                key={item.id}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={cn('h-8 gap-1.5', !active && 'bg-background')}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                    active ? 'bg-primary-foreground/15' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {count}
                </span>
              </Button>
            )
          })}
        </div>
      </div>

      {emptyAll ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="font-medium">No visits yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When your provider schedules work, it will show up here with{' '}
            {terms.singularLower} and payment details.
          </p>
        </Card>
      ) : noResults ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">No jobs match your search.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {visibleSections.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
                  {section.subtitle ? (
                    <p className="mt-0.5 text-sm text-muted-foreground">{section.subtitle}</p>
                  ) : null}
                </div>
              </div>
              <PortalJobsList
                jobs={section.jobs}
                timezone={timezone}
                emptyMessage={section.empty || 'Nothing here.'}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
