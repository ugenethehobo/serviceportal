import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

/** Full-height primary surface for dashboard list/workspace pages. */
export function MainPageCard({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)} {...props}>
      {children}
    </Card>
  )
}

type MainPageCardScrollProps = {
  children: React.ReactNode
  className?: string
  /** Applied to the inner wrapper; defaults to 1px inset so nested card rings are not clipped. */
  contentClassName?: string
}

/** Scrollable body for MainPageCard — requires flex-1 parent with min-h-0. */
export function MainPageCardScroll({
  children,
  className,
  contentClassName,
}: MainPageCardScrollProps) {
  return (
    <ScrollArea
      className={cn('min-h-0 min-w-0 flex-1', className)}
      viewportClassName="scroll-fade max-md:overflow-x-hidden"
    >
      <div className={cn('p-px', contentClassName)}>{children}</div>
    </ScrollArea>
  )
}