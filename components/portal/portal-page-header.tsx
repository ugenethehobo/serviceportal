import type { ReactNode } from 'react'

interface PortalPageHeaderProps {
  title: string
  description?: string
  children?: ReactNode
}

export function PortalPageHeader({ title, description, children }: PortalPageHeaderProps) {
  return (
    <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:items-stretch max-md:[&_button]:min-h-11 max-md:[&_button]:w-full">
          {children}
        </div>
      ) : null}
    </div>
  )
}