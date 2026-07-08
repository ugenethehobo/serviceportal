'use client'

import { useCallback, useState } from 'react'
import { getScheduleCalendarAction } from '@/app/action'
import { ScheduleWeekGrid } from '@/components/dashboard/schedule-week-grid'
import { Button } from '@/components/ui/button'
import { MainPageCard } from '@/components/ui/main-page-card'
import type { ScheduleCalendarData } from '@/lib/schedule-calendar'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

interface ScheduleCalendarPageClientProps {
  initialData: ScheduleCalendarData
}

export function ScheduleCalendarPageClient({
  initialData,
}: ScheduleCalendarPageClientProps) {
  const [data, setData] = useState(initialData)
  const [weekOffset, setWeekOffset] = useState(initialData.weekOffset)
  const [isLoadingWeek, setIsLoadingWeek] = useState(false)

  const loadWeek = useCallback(async (offset: number) => {
    setIsLoadingWeek(true)
    try {
      const result = await getScheduleCalendarAction(offset)
      if (result.success) {
        setData(result.data)
        setWeekOffset(offset)
      }
    } finally {
      setIsLoadingWeek(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    await loadWeek(weekOffset)
  }, [loadWeek, weekOffset])

  return (
    <div className="p-4 md:p-6 flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Week view — color-coded by crew. Click a job for details.
          </p>
        </div>

        <div className="flex items-center gap-2 max-md:w-full">
          <Button
            variant="outline"
            size="icon"
            className="max-md:min-h-11 max-md:min-w-11"
            onClick={() => void loadWeek(weekOffset - 1)}
            disabled={isLoadingWeek}
            aria-label="Previous week"
          >
            {isLoadingWeek ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
          <Button
            variant="outline"
            className="min-w-[200px] gap-2 max-md:min-w-0 max-md:flex-1"
            onClick={() => void loadWeek(0)}
            disabled={isLoadingWeek || weekOffset === 0}
          >
            {isLoadingWeek && <Loader2 className="size-4 animate-spin shrink-0" />}
            <span className={isLoadingWeek ? 'text-muted-foreground' : undefined}>
              {isLoadingWeek ? 'Loading week…' : data.weekLabel}
            </span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="max-md:min-h-11 max-md:min-w-11"
            onClick={() => void loadWeek(weekOffset + 1)}
            disabled={isLoadingWeek}
            aria-label="Next week"
          >
            {isLoadingWeek ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <MainPageCard className="min-h-0 flex-1 gap-0 overflow-hidden p-0 shadow-sm">
        <ScheduleWeekGrid
          data={data}
          isLoadingWeek={isLoadingWeek}
          onRescheduled={refresh}
        />
      </MainPageCard>
    </div>
  )
}