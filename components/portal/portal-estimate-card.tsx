'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToEstimateAction } from '@/app/portal/actions'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ESTIMATE_STATUS_LABELS,
  formatEstimateNumber,
  type Estimate,
  type EstimateStatus,
} from '@/lib/estimates'
import { formatCurrency } from '@/lib/billing'
import { toast } from 'sonner'
import { Check, X } from 'lucide-react'

interface PortalEstimateCardProps {
  estimate: Estimate
}

export function PortalEstimateCard({ estimate }: PortalEstimateCardProps) {
  const router = useRouter()
  const [isResponding, setIsResponding] = useState(false)
  const status = estimate.status as EstimateStatus
  const lineItems = estimate.line_items || []
  const canRespond = status === 'sent' && lineItems.length > 0

  const handleRespond = async (response: 'accepted' | 'declined') => {
    const label = response === 'accepted' ? 'accept' : 'decline'
    if (!confirm(`Are you sure you want to ${label} this estimate?`)) return

    setIsResponding(true)
    const result = await respondToEstimateAction(estimate.id, response)
    if (result.success) {
      toast.success(response === 'accepted' ? 'Estimate accepted' : 'Estimate declined')
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to update estimate')
    }
    setIsResponding(false)
  }

  return (
    <Card className="shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{estimate.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatEstimateNumber(estimate.id, estimate.created_at)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-semibold">{formatCurrency(estimate.total)}</p>
          <Badge variant="outline" className="mt-1 capitalize">
            {ESTIMATE_STATUS_LABELS[status]}
          </Badge>
        </div>
      </div>

      {estimate.description && (
        <p className="px-5 py-3 text-sm text-muted-foreground border-b">
          {estimate.description}
        </p>
      )}

      {lineItems.length > 0 && (
        <div className="divide-y text-sm">
          {lineItems.map((item) => (
            <div key={item.id} className="flex justify-between gap-4 px-5 py-2.5">
              <span className="text-muted-foreground">
                {item.description}
                <span className="text-foreground"> · {item.quantity} qty</span>
              </span>
              <span className="font-medium shrink-0">{formatCurrency(item.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {(canRespond || status === 'accepted' || status === 'declined') && (
        <div className="px-5 py-4 bg-muted/30 border-t">
          {canRespond ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => handleRespond('accepted')} disabled={isResponding}>
                <Check className="size-4" />
                Accept estimate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRespond('declined')}
                disabled={isResponding}
              >
                <X className="size-4" />
                Decline
              </Button>
            </div>
          ) : status === 'accepted' ? (
            <p className="text-sm text-green-700 font-medium">You accepted this estimate.</p>
          ) : (
            <p className="text-sm text-muted-foreground">You declined this estimate.</p>
          )}
        </div>
      )}
    </Card>
  )
}