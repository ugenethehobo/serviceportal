'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { PortalEstimateCard } from '@/components/portal/portal-estimate-card'
import { SearchBar } from '@/components/search-bar'
import {
  ESTIMATE_STATUS_LABELS,
  formatEstimateNumber,
  type Estimate,
} from '@/lib/estimates'
import { matchesSearch } from '@/lib/search'

function filterEstimates(estimates: Estimate[], query: string) {
  return estimates.filter((estimate) =>
    matchesSearch(
      query,
      estimate.title,
      estimate.description,
      formatEstimateNumber(estimate.id, estimate.created_at),
      ESTIMATE_STATUS_LABELS[estimate.status],
      ...(estimate.line_items || []).map((item) => item.description)
    )
  )
}

export function PortalEstimatesPageClient({ estimates }: { estimates: Estimate[] }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => filterEstimates(estimates, query), [estimates, query])
  const pending = filtered.filter((e) => e.status === 'sent')
  const resolved = filtered.filter((e) => e.status !== 'sent')

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title="Estimates"
        description="Review pricing details and accept or decline estimates sent by your service provider."
      />

      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search estimates by title, number, or status..."
        className="max-w-md shrink-0"
      />

      {estimates.length === 0 ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">
            No estimates yet. When your provider sends one, it will appear here.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center shadow-sm">
          <p className="text-muted-foreground text-sm">No estimates match your search.</p>
        </Card>
      ) : (
        <ScrollArea className="flex-1 min-h-0 pr-1" viewportClassName="scroll-fade">
          <div className="flex flex-col gap-6">
          {pending.length > 0 && (
            <section>
              <h2 className="font-semibold text-lg mb-3">Awaiting your response</h2>
              <div className="space-y-3">
                {pending.map((est) => (
                  <PortalEstimateCard key={est.id} estimate={est} />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h2 className="font-semibold text-lg mb-3">
                {pending.length > 0 ? 'Previous estimates' : 'All estimates'}
              </h2>
              <div className="space-y-3">
                {resolved.map((est) => (
                  <PortalEstimateCard key={est.id} estimate={est} />
                ))}
              </div>
            </section>
          )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}