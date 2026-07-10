import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type MobileListCardProps = {
  children: ReactNode
  onClick?: () => void
  className?: string
}

/** Tappable stacked row for phone list views (replaces wide tables below md). */
export function MobileListCard({ children, onClick, className }: MobileListCardProps) {
  return (
    <Card
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'p-4 transition-shadow',
        onClick && 'cursor-pointer hover:shadow-md',
        className
      )}
    >
      {children}
    </Card>
  )
}

type MobileListCardRowProps = {
  label: string
  value: ReactNode
  className?: string
}

export function MobileListCardRow({ label, value, className }: MobileListCardRowProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 text-sm', className)}>
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  )
}