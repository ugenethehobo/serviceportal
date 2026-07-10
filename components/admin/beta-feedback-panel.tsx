'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getAdminBetaFeedbackAction,
  updateBetaFeedbackStatusAction,
} from '@/app/action'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BETA_FEEDBACK_STATUSES,
  BETA_FEEDBACK_TYPES,
  getBetaFeedbackStatusLabel,
  getBetaFeedbackTypeLabel,
  type BetaFeedbackStatus,
  type BetaFeedbackType,
} from '@/lib/beta-feedback'
import type { BetaFeedbackRecord } from '@/lib/beta-feedback-server'
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

function statusVariant(
  status: BetaFeedbackStatus
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'new') return 'destructive'
  if (status === 'reviewed') return 'secondary'
  return 'outline'
}

export function BetaFeedbackPanel() {
  const [items, setItems] = useState<BetaFeedbackRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | BetaFeedbackType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | BetaFeedbackStatus>('all')

  const load = useCallback(async () => {
    setIsLoading(true)
    const result = await getAdminBetaFeedbackAction()
    if (result.success) {
      setItems(result.items)
    } else {
      toast.error(result.error || 'Failed to load feedback')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== 'all' && item.feedback_type !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      return true
    })
  }, [items, statusFilter, typeFilter])

  const newCount = items.filter((item) => item.status === 'new').length

  const updateStatus = async (id: string, status: BetaFeedbackStatus) => {
    setUpdatingId(id)
    const result = await updateBetaFeedbackStatusAction(id, status)
    if (!result.success) {
      toast.error(result.error || 'Failed to update status')
      setUpdatingId(null)
      return
    }
    setItems((current) =>
      current.map((item) => (item.id === id ? result.item : item))
    )
    setUpdatingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Beta feedback</h2>
          <p className="text-sm text-muted-foreground">
            Submissions from the in-app feedback button.
            {newCount > 0 ? ` ${newCount} new.` : ''}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter((value as 'all' | BetaFeedbackType) || 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {BETA_FEEDBACK_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter((value as 'all' | BetaFeedbackStatus) || 'all')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {BETA_FEEDBACK_STATUSES.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading feedback…
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No feedback submissions yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getBetaFeedbackTypeLabel(item.feedback_type)}</Badge>
                  </TableCell>
                  <TableCell className="min-w-[10rem]">
                    <div className="space-y-0.5 text-sm">
                      <p className="font-medium">{item.submitter_name || 'Anonymous'}</p>
                      <p className="text-muted-foreground">{item.submitter_email || '—'}</p>
                      {item.company_name && (
                        <p className="text-xs text-muted-foreground">{item.company_name}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm whitespace-pre-wrap">{item.message}</p>
                    {item.page_url && (
                      <a
                        href={item.page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        View page
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(item.status)}>
                      {getBetaFeedbackStatusLabel(item.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Select
                      value={item.status}
                      onValueChange={(value) =>
                        void updateStatus(item.id, value as BetaFeedbackStatus)
                      }
                      disabled={updatingId === item.id}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BETA_FEEDBACK_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  )
}