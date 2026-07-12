import { getCompanyPaymentsAction } from '@/app/action'
import { PaymentsPageClient } from '@/components/dashboard/payments-page-client'

export default async function PaymentsPage() {
  const result = await getCompanyPaymentsAction({ period: '30d', source: 'all' })

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load payments.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <PaymentsPageClient
      initialData={{
        payments: result.payments,
        summary: result.summary,
        periodLabel: result.periodLabel,
        pagination: result.pagination,
      }}
    />
  )
}