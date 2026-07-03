'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getClientBillingAction } from '@/app/action'
import { formatCurrency } from '@/lib/billing'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { ExternalLink } from 'lucide-react'

interface ClientBillingPanelProps {
  clientId: string
}

export function ClientBillingPanel({ clientId }: ClientBillingPanelProps) {
  const [billing, setBilling] = useState<{
    summary: { totalCharged: number; totalPaid: number; balanceDue: number }
    jobs: Array<{
      scheduleId: string
      title: string
      startTime: string
      status: string
      summary: { totalCharged: number; totalPaid: number; balanceDue: number }
    }>
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchBilling = useCallback(async () => {
    const result = await getClientBillingAction(clientId)
    if (result.success && result.billing) {
      setBilling(result.billing as any)
    } else {
      toast.error(result.error || 'Failed to load billing')
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    fetchBilling()
  }, [fetchBilling])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading billing...</div>
  }

  if (!billing) {
    return <div className="text-sm text-muted-foreground">Unable to load billing data.</div>
  }

  const jobsWithBilling = billing.jobs.filter(
    (j) => j.summary.totalCharged > 0 || j.summary.totalPaid > 0
  )

  return (
    <div className="flex flex-col gap-6 flex-1 min-h-0">
      <p className="text-sm text-muted-foreground">
        Clients pay job balances through the client portal. Record cash payments on individual job billing tabs.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Total Billed" value={formatCurrency(billing.summary.totalCharged)} />
        <SummaryCard label="Total Paid" value={formatCurrency(billing.summary.totalPaid)} />
        <SummaryCard
          label="Balance Due"
          value={formatCurrency(billing.summary.balanceDue)}
          highlight={billing.summary.balanceDue > 0}
        />
      </div>

      {jobsWithBilling.length > 0 ? (
        <ScrollArea className="border rounded-lg flex-1 min-h-0" viewportClassName="scroll-fade">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Charged</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobsWithBilling.map((job) => (
                <TableRow key={job.scheduleId}>
                  <TableCell className="font-medium">{job.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(job.startTime).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(job.summary.totalCharged)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(job.summary.totalPaid)}</TableCell>
                  <TableCell className={`text-right font-medium ${job.summary.balanceDue > 0 ? 'text-orange-600' : ''}`}>
                    {formatCurrency(job.summary.balanceDue)}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/dashboard/clients/${clientId}/jobs/${job.scheduleId}?tab=billing`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      Billing
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      ) : (
        <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground text-sm flex-1 flex items-center justify-center">
          No billing activity yet. Add line items on individual job billing tabs.
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tracking-tight mt-1 ${highlight ? 'text-orange-600' : ''}`}>
        {value}
      </div>
    </div>
  )
}