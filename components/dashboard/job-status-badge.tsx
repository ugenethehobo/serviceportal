import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type JobStatus = 'scheduled' | 'in_progress' | 'archived' | 'cancelled'

const statusConfig: Record<JobStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  scheduled: { label: 'Scheduled', variant: 'secondary' },
  in_progress: { label: 'In Progress', variant: 'default' },
  archived: { label: 'Archived', variant: 'outline' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
}

interface JobStatusBadgeProps {
  status: string
  className?: string
}

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
  const config = statusConfig[status as JobStatus] ?? { label: status, variant: 'outline' as const }

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)}>
      {config.label}
    </Badge>
  )
}