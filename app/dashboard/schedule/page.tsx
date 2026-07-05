import { getScheduleCalendarAction } from '@/app/action'
import { ScheduleCalendarPageClient } from '@/components/dashboard/schedule-calendar-page-client'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const result = await getScheduleCalendarAction(0)

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <h1 className="text-3xl font-bold tracking-tight mb-4">Schedule</h1>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load schedule.'}
          </p>
        </div>
      </div>
    )
  }

  return <ScheduleCalendarPageClient initialData={result.data} />
}