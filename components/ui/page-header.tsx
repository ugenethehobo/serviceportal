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
        // No bottom margin: dashboard pages use MOBILE_PAGE_ROOT gap for spacing.
        'flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <h1
          className={cn(
            'font-bold tracking-tight',
            size === 'page' ? 'text-3xl max-md:text-2xl' : 'text-2xl max-md:text-xl'
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch max-md:gap-2.5 max-md:[&_[data-slot=select-trigger]]:w-full max-md:[&_button]:min-h-11 max-md:[&_button]:w-full">
          {actions}
        </div>
      ) : null}
    </div>
  )
}