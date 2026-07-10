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
        size === 'page' ? 'mb-6 max-md:mb-4' : 'mb-4',
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            'font-bold tracking-tight',
            size === 'page' ? 'text-3xl max-md:text-2xl' : 'text-2xl'
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground mt-1">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch max-md:[&_[data-slot=select-trigger]]:w-full max-md:[&_button]:min-h-11 max-md:[&_button]:w-full">
          {actions}
        </div>
      ) : null}
    </div>
  )
}