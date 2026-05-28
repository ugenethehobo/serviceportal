'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { addMonths, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { expandRecurringJob, getDefaultTimezone, formatJobSchedule } from '@/lib/date-utils'

interface Job {
  id: string
  title: string
  status: string
  scheduled_date: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  price: number | null
  clients: { name: string } | null
  bills?: any[]
  is_recurring?: boolean
  recurrence_frequency?: string | null
  recurrence_end_date?: string | null
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([])
  const [showJobModal, setShowJobModal] = useState(false)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const [jobStatuses, setJobStatuses] = useState<any[]>([])
  const [defaultTimezone, setDefaultTimezone] = useState('America/Chicago')

  const supabase = createClient()

  // Load company tz + all jobs (including recurring masters), then client-side expand recurring
  const loadJobsAndSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: settings } = await supabase
        .from('company_settings')
        .select('default_timezone, job_statuses')
        .eq('user_id', user.id)
        .single()
      if (settings?.default_timezone) setDefaultTimezone(getDefaultTimezone(settings.default_timezone))
      if (settings?.job_statuses && Array.isArray(settings.job_statuses)) {
        setJobStatuses(settings.job_statuses)
      }
    }

    const { data } = await supabase
      .from('jobs')
      .select(`*, clients (name), bills (*)`)
      // Do not filter here — we expand recurring which may synthesize dates; fetch all with any schedule info
      .or('scheduled_date.not.is.null,scheduled_start.not.is.null')

    if (data) {
      // Store the raw masters; expansion happens in getJobsForDay per visible range
      setJobs(data)
    }
  }

  const loadJobStatuses = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: settings } = await supabase
      .from('company_settings')
      .select('job_statuses')
      .eq('user_id', user.id)
      .single()

    if (settings?.job_statuses && Array.isArray(settings.job_statuses)) {
      setJobStatuses(settings.job_statuses)
    } else {
      setJobStatuses([
        { key: "quote_sent", label: "Quote Sent", color: "#eab308" },
        { key: "scheduled", label: "Scheduled", color: "#3b82f6" },
        { key: "in_progress", label: "In Progress", color: "#8b5cf6" },
        { key: "completed", label: "Completed", color: "#22c55e" },
        { key: "invoiced", label: "Invoiced", color: "#f97316" },
        { key: "paid", label: "Paid", color: "#10b981" },
      ])
    }
  }

  useEffect(() => {
    loadJobsAndSettings()
  }, [])

  // Date calculations
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  // Weekly view
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // Expand recurring jobs into instances for the currently visible calendar range.
  // This makes recurring jobs appear on the calendar (the previous implementation did not).
  const expandedJobs = useMemo(() => {
    // Recompute range locally so we don't depend on later declarations
    const monthStartLocal = startOfMonth(currentDate)
    const monthEndLocal = endOfMonth(currentDate)
    const calendarStartLocal = startOfWeek(monthStartLocal)
    const calendarEndLocal = endOfWeek(monthEndLocal)
    const weekStartLocal = startOfWeek(currentDate)

    const rangeStart = view === 'month' ? calendarStartLocal : weekStartLocal
    const rangeEnd = view === 'month' ? calendarEndLocal : addDays(weekStartLocal, 6)

    const all: any[] = []
    for (const raw of jobs) {
      const ex = expandRecurringJob(raw, rangeStart, rangeEnd)
      all.push(...ex)
    }
    return all
  }, [jobs, view, currentDate])

  const getJobsForDay = (day: Date) => {
    const targetDateString = format(day, 'yyyy-MM-dd')
    return expandedJobs.filter(job => {
      const s = job.scheduled_start || job.scheduled_date
      if (!s) return false
      const jobDateString = s.includes('T') ? s.split('T')[0] : s
      return jobDateString === targetDateString
    })
  }

  const openDayModal = async (day: Date) => {
    const dayJobs = getJobsForDay(day)
    setSelectedDate(day)

    // Fetch bills for these jobs (more reliable than nested select)
    if (dayJobs.length > 0) {
      const jobIds = dayJobs.map(j => j.id)

      const { data: billsData } = await supabase
        .from('bills')
        .select('*')
        .in('job_id', jobIds)

      // Attach bills to each job
      const jobsWithBills = dayJobs.map(job => ({
        ...job,
        bills: billsData?.filter(b => b.job_id === job.id) || []
      }))

      setSelectedJobs(jobsWithBills)
    } else {
      setSelectedJobs([])
    }

    setShowJobModal(true)
  }

  const getStatusColor = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)
    return found?.color || '#64748b'
  }

  const getStatusLabel = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)
    return found?.label || status.replace('_', ' ')
  }

  // ==================== DRAG AND DROP (UNCHANGED) ====================
  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    setDraggedJobId(jobId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedJobId) return

    const targetElement = e.currentTarget as HTMLElement
    const newDateString = targetElement.getAttribute('data-date')
    if (!newDateString) return

    const localMidnight = new Date(newDateString + 'T00:00:00')
    const isoString = localMidnight.toISOString()

    const { error } = await supabase
      .from('jobs')
      .update({ scheduled_date: isoString, scheduled_start: isoString })
      .eq('id', draggedJobId)

    if (!error) {
      setJobs(prev =>
        prev.map(job =>
          job.id === draggedJobId
            ? { ...job, scheduled_date: newDateString }
            : job
        )
      )
    }
    setDraggedJobId(null)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Calendar</h1>
          <p className="text-muted-foreground mt-2">View and manage your scheduled jobs</p>
        </div>

        <div className="flex items-center gap-4">
          <Tabs value={view} onValueChange={(v) => setView(v as 'month' | 'week')}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => {
              if (view === 'month') setCurrentDate(subMonths(currentDate, 1))
              else setCurrentDate(addDays(currentDate, -7))
            }}>
              ←
            </Button>
            <div className="font-semibold text-xl min-w-[220px] text-center">
              {view === 'month'
                ? format(currentDate, 'MMMM yyyy')
                : `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
              }
            </div>
            <Button variant="outline" onClick={() => {
              if (view === 'month') setCurrentDate(addMonths(currentDate, 1))
              else setCurrentDate(addDays(currentDate, 7))
            }}>
              →
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          {view === 'month' ? (
            <>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {days.map((day, index) => {
                  const dayJobs = getJobsForDay(day)
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth()
                  const isToday = isSameDay(day, new Date())
                  const dateString = format(day, 'yyyy-MM-dd')

                  return (
                    <div
                      key={index}
                      data-date={dateString}
                      onClick={() => openDayModal(day)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className={`min-h-[120px] p-3 border rounded-2xl cursor-pointer transition-all hover:border-primary ${isCurrentMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'} ${isToday ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>
                          {format(day, 'd')}
                        </div>
                        {dayJobs.length > 0 && (
                          <Badge variant="secondary" className="text-xs">{dayJobs.length}</Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        {dayJobs.slice(0, 2).map((job, i) => (
                          <div
                            key={i}
                            draggable
                            onDragStart={(e) => handleDragStart(e, job.id)}
                            className="text-xs p-1.5 rounded-lg text-white truncate cursor-move"
                            style={{ backgroundColor: getStatusColor(job.status) }}
                          >
                            {job.title}
                          </div>
                        ))}
                        {dayJobs.length > 2 && (
                          <div className="text-xs text-muted-foreground">+{dayJobs.length - 2} more</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            /* Week View */
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day, index) => {
                const dayJobs = getJobsForDay(day)
                const isToday = isSameDay(day, new Date())
                const dateString = format(day, 'yyyy-MM-dd')

                return (
                  <div
                    key={index}
                    data-date={dateString}
                    onClick={() => openDayModal(day)}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`min-h-[400px] p-4 border rounded-2xl cursor-pointer transition-all hover:border-primary ${isToday ? 'border-primary bg-primary/5' : 'bg-background'}`}
                  >
                    <div className="text-center mb-4">
                      <div className="text-sm text-muted-foreground">{format(day, 'EEE')}</div>
                      <div className={`text-2xl font-semibold ${isToday ? 'text-primary' : ''}`}>
                        {format(day, 'd')}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {dayJobs.map((job, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, job.id)}
                          className="p-3 rounded-xl text-white text-sm cursor-move"
                          style={{ backgroundColor: getStatusColor(job.status) }}
                        >
                          <div className="font-medium truncate">{job.title}</div>
                          <div className="text-xs opacity-80 mt-1">{job.clients?.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day Detail Modal */}
      <Dialog open={showJobModal} onOpenChange={setShowJobModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </DialogTitle>
          </DialogHeader>

          {selectedJobs.length > 0 ? (
            <div className="space-y-4">
              {selectedJobs.map((job, index) => {
                const jobBills = job.bills || []
                const totalDue = jobBills
                  .filter((b: any) => b.status === 'pending')
                  .reduce((sum: number, b: any) => sum + Number(b.amount), 0)

                return (
                  <div key={index} className="border rounded-2xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-semibold text-lg">{job.title}</div>
                        <div className="text-sm text-muted-foreground">{job.clients?.name}</div>
                        {(job.scheduled_start || job.scheduled_date) && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatJobSchedule(job, getDefaultTimezone(defaultTimezone))}
                          </div>
                        )}
                      </div>
                      <Badge style={{ backgroundColor: getStatusColor(job.status) }} className="text-white">
                        {getStatusLabel(job.status)}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        {jobBills.length} bill{jobBills.length !== 1 ? 's' : ''}
                      </div>
                      <div className="font-semibold text-emerald-600">
                        ${totalDue.toFixed(2)} due
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No jobs scheduled for this day
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
