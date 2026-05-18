'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { addMonths, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, addDays } from 'date-fns'

interface Job {
  id: string
  title: string
  status: string
  scheduled_date: string | null
  price: number | null
  clients: { name: string } | null
}

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [jobs, setJobs] = useState<Job[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Job[]>([])
  const [showJobModal, setShowJobModal] = useState(false)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [draggedJobId, setDraggedJobId] = useState<string | null>(null)
  const supabase = createClient()

  const loadJobs = async () => {
    const { data } = await supabase
      .from('jobs')
      .select(`*, clients (name)`)
      .not('scheduled_date', 'is', null)
    if (data) setJobs(data)
  }

  useEffect(() => {
    loadJobs()
  }, [])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = startOfWeek(monthStart)
  const calendarEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })

  // Weekly view
  const weekStart = startOfWeek(currentDate)
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const getJobsForDay = (day: Date) => {
  const targetDateString = format(day, 'yyyy-MM-dd')

  return jobs.filter(job => {
    if (!job.scheduled_date) return false

    // Extract just the date part (handles both "2026-05-18" and full ISO strings)
    const jobDateString = job.scheduled_date.includes('T')
      ? job.scheduled_date.split('T')[0]
      : job.scheduled_date

    return jobDateString === targetDateString
  })
}

  const openDayModal = (day: Date) => {
    const dayJobs = getJobsForDay(day)
    setSelectedDate(day)
    setSelectedJobs(dayJobs)
    setShowJobModal(true)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      quote_sent: 'bg-yellow-500',
      scheduled: 'bg-blue-500',
      in_progress: 'bg-purple-500',
      completed: 'bg-green-500',
      invoiced: 'bg-orange-500',
      paid: 'bg-emerald-500'
    }
    return colors[status] || 'bg-gray-500'
  }

  // Drag and Drop
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

  // Send as local midnight to avoid any timezone shift
  const localMidnight = new Date(newDateString + 'T00:00:00')
  const isoString = localMidnight.toISOString()

  const { error } = await supabase
    .from('jobs')
    .update({ scheduled_date: isoString })
    .eq('id', draggedJobId)

  if (!error) {
    // Update local state with clean date string
    setJobs(prev => prev.map(job =>
      job.id === draggedJobId
        ? { ...job, scheduled_date: newDateString }
        : job
    ))
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
            <Button
              variant="outline"
              onClick={() => {
                if (view === 'month') {
                  setCurrentDate(subMonths(currentDate, 1))
                } else {
                  setCurrentDate(addDays(currentDate, -7))
                }
              }}
            >
              ←
            </Button>

            <div className="font-semibold text-xl min-w-[220px] text-center">
              {view === 'month'
                ? format(currentDate, 'MMMM yyyy')
                : `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
              }
            </div>

            <Button
              variant="outline"
              onClick={() => {
                if (view === 'month') {
                  setCurrentDate(addMonths(currentDate, 1))
                } else {
                  setCurrentDate(addDays(currentDate, 7))
                }
              }}
            >
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
                      className={`
                        min-h-[120px] p-3 border rounded-2xl cursor-pointer transition-all hover:border-primary
                        ${isCurrentMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'}
                        ${isToday ? 'border-primary bg-primary/5' : ''}
                      `}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className={`text-sm font-medium ${isToday ? 'text-primary' : ''}`}>
                          {format(day, 'd')}
                        </div>
                        {dayJobs.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {dayJobs.length}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-1">
                        {dayJobs.slice(0, 2).map((job, i) => (
                          <div
                            key={i}
                            draggable
                            onDragStart={(e) => handleDragStart(e, job.id)}
                            className={`text-xs p-1.5 rounded-lg text-white truncate cursor-move ${getStatusColor(job.status)}`}
                          >
                            {job.title}
                          </div>
                        ))}
                        {dayJobs.length > 2 && (
                          <div className="text-xs text-muted-foreground">
                            +{dayJobs.length - 2} more
                          </div>
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
                    className={`
                      min-h-[400px] p-4 border rounded-2xl cursor-pointer transition-all hover:border-primary
                      ${isToday ? 'border-primary bg-primary/5' : 'bg-background'}
                    `}
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
                          className={`p-3 rounded-xl text-white text-sm cursor-move ${getStatusColor(job.status)}`}
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
              {selectedJobs.map((job, index) => (
                <div key={index} className="border rounded-2xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-semibold text-lg">{job.title}</div>
                      <div className="text-sm text-muted-foreground">{job.clients?.name}</div>
                    </div>
                    <Badge className={getStatusColor(job.status)}>
                      {job.status.replace('_', ' ')}
                    </Badge>
                  </div>

                  {job.price && (
                    <div className="text-sm font-medium text-emerald-600">
                      ${job.price}
                    </div>
                  )}
                </div>
              ))}
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
