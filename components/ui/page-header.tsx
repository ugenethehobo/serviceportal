import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  size?: 'page' | 'compact'
  className?: string
}

export function PageHeader({
  title,
  description,
  actions,
  size = 'page',
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0',
        size === 'page' ? 'mb-6' : 'mb-4',
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            'font-bold tracking-tight',
            size === 'page' ? 'text-3xl' : 'text-2xl'
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}