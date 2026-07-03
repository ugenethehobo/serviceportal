import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface SettingsPanelProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export function SettingsPanel({
  title,
  description,
  children,
  className,
  action,
}: SettingsPanelProps) {
  return (
    <Card
      className={cn(
        'flex flex-col min-h-0 overflow-hidden shadow-sm',
        className
      )}
    >
      <div className="shrink-0 flex items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {action}
      </div>
      <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
        <div className="px-5 py-4">{children}</div>
      </ScrollArea>
    </Card>
  )
}
