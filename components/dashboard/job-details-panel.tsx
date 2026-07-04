'use client'

import Link from 'next/link'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { MapsNavigateButton } from '@/components/dashboard/maps-navigate-button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  CalendarDays,
  Clock,
  DollarSign,
  FileText,
  MapPin,
  Repeat,
  User,
  Users,
} from 'lucide-react'

type JobDetailsPanelJob = {
  id: string
  client_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: string
  price: number
  recurring_rule_id: string | null
  crew?: { id: string; name: string } | null
}

interface JobDetailsPanelProps {
  job: JobDetailsPanelJob
  clientName: string
  clientId: string
  jobAddress: string
  isTeamMember: boolean
}

function formatJobDuration(startTime: string, endTime: string) {
  const start = new Date(startTime).getTime()
  const end = new Date(endTime).getTime()
  const minutes = Math.max(0, Math.round((end - start) / 60000))

  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (remainder === 0) return `${hours} hr`
  return `${hours} hr ${remainder} min`
}

function DetailMetric({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof CalendarDays
  label: string
  value: React.ReactNode
  href?: string
}) {
  const content = (
    <div className="rounded-lg border bg-card p-4 h-full">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="size-4 shrink-0" />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-sm font-medium leading-snug">{value}</div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block h-full transition-colors hover:bg-muted/40 rounded-lg">
        {content}
      </Link>
    )
  }

  return content
}

export function JobDetailsPanel({
  job,
  clientName,
  clientId,
  jobAddress,
  isTeamMember,
}: JobDetailsPanelProps) {
  const startDate = new Date(job.start_time)
  const endDate = new Date(job.end_time)
  const sameDay = startDate.toDateString() === endDate.toDateString()
  const durationLabel = formatJobDuration(job.start_time, job.end_time)

  const dateLabel = startDate.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const timeLabel = sameDay
    ? `${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : `${startDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`

  const priceLabel =
    job.price > 0 ? (
      `$${job.price.toFixed(2)}`
    ) : (
      <span className="text-muted-foreground font-normal italic">Not set</span>
    )

  const crewLabel = job.crew?.name || (
    <span className="text-muted-foreground font-normal italic">Unassigned</span>
  )

  const clientLabel = clientName || (
    <span className="text-muted-foreground font-normal italic">Unknown client</span>
  )

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="rounded-xl border bg-muted/25 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 min-w-0">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-background border p-2.5 shrink-0">
                <CalendarDays className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Scheduled visit
                </p>
                <p className="text-lg sm:text-xl font-semibold tracking-tight mt-1">{dateLabel}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5 shrink-0" />
                    {timeLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{durationLabel}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <JobStatusBadge status={job.status} />
            {job.recurring_rule_id ? (
              <Badge variant="outline" className="gap-1">
                <Repeat className="size-3" />
                Recurring
              </Badge>
            ) : (
              <Badge variant="outline">One-time</Badge>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <DetailMetric icon={Users} label="Crew" value={crewLabel} />
        <DetailMetric icon={DollarSign} label="Quoted price" value={priceLabel} />
        {!isTeamMember && (
          <DetailMetric
            icon={User}
            label="Client"
            value={clientLabel}
            href={`/dashboard/clients/${clientId}`}
          />
        )}
        <DetailMetric
          icon={Repeat}
          label="Schedule type"
          value={job.recurring_rule_id ? 'Recurring job' : 'Single visit'}
        />
      </section>

      <section className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <MapPin className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Service location</h2>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          {!isTeamMember && clientName && (
            <p className="text-sm">
              <span className="text-muted-foreground">Client: </span>
              <Link
                href={`/dashboard/clients/${clientId}`}
                className="font-medium hover:underline"
              >
                {clientName}
              </Link>
            </p>
          )}
          <p className="text-sm leading-relaxed">
            {jobAddress === 'No address on file' ? (
              <span className="text-muted-foreground italic">{jobAddress}</span>
            ) : (
              jobAddress
            )}
          </p>
          {jobAddress !== 'No address on file' && (
            <MapsNavigateButton
              address={jobAddress}
              className="w-full sm:w-auto"
              size={isTeamMember ? 'lg' : 'default'}
            />
          )}
        </div>
      </section>

      <section className="rounded-xl border overflow-hidden">
        <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Work description</h2>
        </div>
        <div className="p-4 sm:p-5">
          {job.description?.trim() ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{job.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No description provided for this job.</p>
          )}
        </div>
      </section>

      <Separator className="opacity-60" />

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Job ID</dt>
          <dd className="font-mono text-xs mt-0.5 break-all">{job.id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ends</dt>
          <dd className="mt-0.5">
            {endDate.toLocaleString([], {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </dd>
        </div>
      </dl>
    </div>
  )
}