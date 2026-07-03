import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'

interface PortalStatCardProps {
  label: string
  value: string
  icon: LucideIcon
  highlight?: boolean
}

export function PortalStatCard({ label, value, icon: Icon, highlight }: PortalStatCardProps) {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p
            className={`text-3xl font-semibold tracking-tight mt-1 ${
              highlight ? 'text-orange-600' : ''
            }`}
          >
            {value}
          </p>
        </div>
        <div className="rounded-lg bg-muted p-2 text-muted-foreground">
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  )
}