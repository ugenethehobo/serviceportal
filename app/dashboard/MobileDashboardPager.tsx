'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CalendarDays, Map, AlertCircle } from "lucide-react"
import { DashboardCharts } from './DashboardCharts'
import RoutePlannerPreviewWrapper from './RoutePlannerPreviewWrapper'

interface MobileDashboardPagerProps {
  todayJobs: any[]
  upcomingJobs: any[]
  jobsDueThisWeekCount: number
  revenueTrendData: any[]
  statusPieData: any[]
  primaryColor: string | null
  mtdRevenue: number
  totalLeads: number
  freshLeads: number
  agingLeads: number
  staleLeads: number
  routePlannerEnabled: boolean
  routableJobsToday: number
  roughDriveMinutes: number | null
  routePreviewPoints: any[]
  overdueJobsCount: number
  totalOutstanding: number
  customColorMap: Record<string, string>
  getStatusColor: (status: string) => string
}

export default function MobileDashboardPager(props: MobileDashboardPagerProps) {
  const {
    todayJobs,
    upcomingJobs,
    jobsDueThisWeekCount,
    revenueTrendData,
    statusPieData,
    primaryColor,
    mtdRevenue,
    totalLeads,
    freshLeads,
    agingLeads,
    staleLeads,
    routePlannerEnabled,
    routableJobsToday,
    roughDriveMinutes,
    routePreviewPoints,
    overdueJobsCount,
    totalOutstanding,
    customColorMap,
    getStatusColor,
  } = props

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)

  // Calculate number of pages
  const totalPages = routePlannerEnabled ? 4 : 3

  // Track current page on scroll
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const handleScroll = () => {
      const scrollLeft = scroller.scrollLeft
      const pageWidth = scroller.clientWidth * 0.92 + 16 // approx min-w + gap
      const newPage = Math.round(scrollLeft / pageWidth)
      if (newPage !== currentPage && newPage >= 0 && newPage < totalPages) {
        setCurrentPage(newPage)
      }
    }

    scroller.addEventListener('scroll', handleScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', handleScroll)
  }, [currentPage, totalPages])

  const goToPage = (index: number) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const pageWidth = scroller.clientWidth * 0.92 + 16
    scroller.scrollTo({
      left: index * pageWidth,
      behavior: 'smooth'
    })
    setCurrentPage(index)
  }

  return (
    <div className="lg:hidden">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2 px-1">
        Swipe to explore →
      </div>

      <div 
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-6 -mx-4 px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        
        {/* Page 1: Today & Upcoming */}
        <div className="min-w-[92vw] snap-start">
          <Card className="border-l-4 border-l-primary h-full">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <CardTitle className="text-base">Today &amp; Upcoming</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link href="/dashboard/calendar">View →</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-4">
                {/* Today */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Today</span>
                    <span className="text-xs text-muted-foreground">{todayJobs.length} jobs</span>
                  </div>
                  {todayJobs.length > 0 ? (
                    <div className="space-y-2">
                      {todayJobs.slice(0, 3).map((job: any) => {
                        const color = customColorMap[job.status] || getStatusColor(job.status);
                        return (
                          <div key={job.id} className="border p-2.5 text-sm rounded-lg">
                            <div className="font-medium truncate">{job.title || 'Untitled job'}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(job.scheduled_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4">No jobs today</div>
                  )}
                </div>

                {/* Upcoming */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Next 7 Days</span>
                    <span className="text-xs text-muted-foreground">{upcomingJobs.length} jobs</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto">
                    {upcomingJobs.slice(0, 4).map((job: any) => (
                      <div key={job.id} className="min-w-[140px] border p-2.5 text-sm rounded-lg flex-shrink-0">
                        <div className="font-medium truncate">{job.title}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(job.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Page 2: Performance Analytics */}
        <div className="min-w-[92vw] snap-start">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Performance Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardCharts
                revenueTrendData={revenueTrendData}
                statusPieData={statusPieData}
                primaryColor={primaryColor}
                mtdRevenue={mtdRevenue}
              />
            </CardContent>
          </Card>
        </div>

        {/* Page 3: Pipeline & Needs Attention */}
        <div className="min-w-[92vw] snap-start space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <span className="font-semibold">{totalLeads}</span> leads
                <div className="text-xs mt-1">
                  <span className="text-green-600">{freshLeads} fresh</span> • 
                  <span className="text-amber-600 mx-1">{agingLeads} aging</span> • 
                  <span className="text-red-600">{staleLeads} stale</span>
                </div>
              </div>
              <Link href="/dashboard/leads" className="text-xs text-primary mt-2 inline-block">Manage leads →</Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
                <AlertCircle className="h-4 w-4" /> Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {overdueJobsCount > 0 && (
                <div className="flex justify-between bg-red-50 px-3 py-2 text-red-700 rounded">
                  <span>{overdueJobsCount} overdue</span>
                  <Link href="/dashboard/calendar" className="text-xs hover:underline">Review</Link>
                </div>
              )}
              {staleLeads > 0 && (
                <div className="flex justify-between bg-amber-50 px-3 py-2 text-amber-700 rounded">
                  <span>{staleLeads} stale leads</span>
                  <Link href="/dashboard/leads" className="text-xs hover:underline">Follow up</Link>
                </div>
              )}
              {totalOutstanding > 0 && (
                <div className="flex justify-between px-1">
                  <span>${totalOutstanding.toLocaleString()} outstanding</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Page 4: Route Planner (if enabled) */}
        {routePlannerEnabled && (
          <div className="min-w-[92vw] snap-start">
            <Card className="relative min-h-[220px] overflow-hidden p-0 rounded-2xl">
              <div className="absolute inset-0 z-0">
                <RoutePlannerPreviewWrapper points={routePreviewPoints} />
              </div>
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60 z-10" />
              <div className="absolute inset-0 flex flex-col justify-between p-5 z-20 text-white">
                <div>
                  <div className="flex items-center gap-2">
                    <Map className="h-5 w-5" />
                    <span className="font-semibold text-lg">Route Planner</span>
                  </div>
                  <div className="mt-3 text-3xl font-semibold">{routableJobsToday} stops</div>
                  {roughDriveMinutes !== null && (
                    <div className="text-sm opacity-90">~{roughDriveMinutes} min total drive</div>
                  )}
                </div>
                <Button asChild size="lg" className="bg-white text-black hover:bg-white/90 rounded-xl">
                  <Link href="/dashboard/route-planner">Open Route Planner →</Link>
                </Button>
              </div>
            </Card>
          </div>
        )}

      </div>

      {/* Page Indicator Dots */}
      <div className="flex justify-center gap-2 mt-1">
        {Array.from({ length: totalPages }).map((_, index) => (
          <button
            key={index}
            onClick={() => {
              const scroller = document.querySelector('.lg\\:hidden .flex.overflow-x-auto') as HTMLDivElement
              if (scroller) {
                const pageWidth = scroller.clientWidth * 0.92 + 16
                scroller.scrollTo({
                  left: index * pageWidth,
                  behavior: 'smooth'
                })
              }
            }}
            className={`h-2 rounded-full transition-all ${
              currentPage === index 
                ? 'w-6 bg-primary' 
                : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60'
            }`}
            aria-label={`Go to page ${index + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
