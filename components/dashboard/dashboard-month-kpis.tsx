'use client'

import { Card } from '@/components/ui/card'
import { formatReportsCurrency } from '@/lib/reports'
import type { DashboardMonthlyKpis } from '@/lib/dashboard-overview'

function KpiCard({
  label,
  value,
  hint,
  highlight,
}: {
  label: string
  value: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <Card className="p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-semibold tracking-tight mt-1 ${
          highlight ? 'text-orange-600' : ''
        }`}
      >
        {value}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </Card>
  )
}

interface DashboardMonthKpisProps {
  kpis: DashboardMonthlyKpis
  variant: 'revenue' | 'activity'
}

export function DashboardMonthKpis({ kpis, variant }: DashboardMonthKpisProps) {
  if (variant === 'revenue') {
    return (
      <div className="grid flex-1 content-start gap-3 sm:grid-cols-1">
        <KpiCard
          label="Billed"
          value={formatReportsCurrency(kpis.totalBilled)}
          hint={`Completed jobs · ${kpis.monthLabel}`}
        />
        <KpiCard
          label="Collected"
          value={formatReportsCurrency(kpis.totalCollected)}
          hint={
            kpis.collectedSource === 'stripe'
              ? `Stripe · ${kpis.monthLabel}`
              : kpis.monthLabel
          }
        />
        <KpiCard
          label="Outstanding"
          value={formatReportsCurrency(kpis.balanceDue)}
          hint="Open job balances"
          highlight={kpis.balanceDue > 0}
        />
      </div>
    )
  }

  return (
    <div className="grid flex-1 content-start gap-3 sm:grid-cols-2">
      <KpiCard
        label="Jobs completed"
        value={String(kpis.jobsCompleted)}
        hint={kpis.monthLabel}
      />
      <KpiCard
        label="Open jobs"
        value={String(kpis.jobsScheduled)}
        hint={`Scheduled or in progress · ${kpis.monthLabel}`}
      />
      <KpiCard label="Active clients" value={String(kpis.activeClients)} />
      <KpiCard
        label="Leads converted"
        value={String(kpis.leadsConverted)}
        hint={kpis.monthLabel}
      />
      <KpiCard
        label="Estimates sent"
        value={String(kpis.estimatesSent)}
        hint={kpis.monthLabel}
      />
    </div>
  )
}