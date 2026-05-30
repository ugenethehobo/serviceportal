'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { CalendarDays, Map, AlertCircle, Users, UserPlus, Briefcase, Calendar } from "lucide-react"
import { DashboardCharts } from './DashboardCharts'
import RoutePlannerPreviewWrapper from './RoutePlannerPreviewWrapper'
import { getStatusColor } from '@/lib/status-colors'

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
  activeJobs: number
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
    activeJobs,
  } = props

  const scrollerRef = useRef<HTMLDivElement>(null)
  const [currentPage, setCurrentPage] = useState(0)

  // Always 4 pages as per new structure
  const totalPages = 4

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
    <div className="lg:hidden"> {/* All elements inside are forced square for mobile */}

      <div 
        ref={scrollerRef}
        className="flex overflow-x-auto snap-x snap-mandatory pb-6 -mx-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        
        {/* Page 1: Today & Upcoming (pure - no stats) */}
        <div className="min-w-full snap-start px-4">
          <Card className="border-l-4 border-l-primary h-full rounded-none">
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
              <div className="space-y-5">
                {/* Today */}
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <div className="text-sm font-semibold">Today</div>
                    <div className="text-xs text-muted-foreground">{todayJobs.length} jobs</div>
                  </div>
                  {todayJobs.length > 0 ? (
                    <div className="space-y-2">
                      {todayJobs.slice(0, 4).map((job: any) => {
                        const color = customColorMap[job.status] || getStatusColor(job.status);
                        return (
                          <div 
                            key={job.id} 
                            className="border p-3 text-sm rounded-none"
                            style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                          >
                            <div className="font-medium truncate">{job.title || 'Untitled job'}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(job.scheduled_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-none">
                      No jobs scheduled for today
                    </div>
                  )}
                </div>

                {/* Upcoming - with status colors */}
                <div>
                  <div className="flex justify-between items-baseline mb-2">
                    <div className="text-sm font-semibold">Next 7 Days</div>
                    <div className="text-xs text-muted-foreground">{upcomingJobs.length} jobs</div>
                  </div>
                  {upcomingJobs.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {upcomingJobs.slice(0, 5).map((job: any) => {
                        const color = customColorMap[job.status] || getStatusColor(job.status);
                        return (
                          <div 
                            key={job.id} 
                            className="min-w-[150px] flex-shrink-0 border p-3 text-sm rounded-none"
                            style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
                          >
                            <div className="font-medium truncate leading-tight">{job.title}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(job.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground py-4">No upcoming jobs</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Page 2: Leads Pipeline ONLY */}
        <div className="min-w-full snap-start px-4">
          <Card className="h-full rounded-none">
            <CardHeader>
              <CardTitle className="text-base">Leads Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <div className="text-6xl font-semibold tabular-nums tracking-tighter">{totalLeads}</div>
                <div className="text-sm text-muted-foreground mt-1">total leads in pipeline</div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between border p-4">
                  <div>
                    <div className="font-medium">Fresh</div>
                    <div className="text-xs text-muted-foreground">High priority</div>
                  </div>
                  <div className="text-3xl font-semibold text-green-600">{freshLeads}</div>
                </div>

                <div className="flex items-center justify-between border p-4">
                  <div>
                    <div className="font-medium">Aging</div>
                    <div className="text-xs text-muted-foreground">Needs attention</div>
                  </div>
                  <div className="text-3xl font-semibold text-amber-600">{agingLeads}</div>
                </div>

                <div className="flex items-center justify-between border p-4">
                  <div>
                    <div className="font-medium">Stale</div>
                    <div className="text-xs text-muted-foreground">Follow up urgently</div>
                  </div>
                  <div className="text-3xl font-semibold text-red-600">{staleLeads}</div>
                </div>
              </div>

              <Link 
                href="/dashboard/leads" 
                className="block w-full text-center py-3 text-sm font-medium border hover:bg-muted"
              >
                Manage Leads →
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Page 3: Route Planner */}
        <div className="min-w-full snap-start px-4">
          <Card className="relative min-h-[320px] overflow-hidden p-0 rounded-none">
            <div className="absolute inset-0 z-0">
              <RoutePlannerPreviewWrapper points={routePreviewPoints} />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/70 z-10" />
            
            <div className="absolute inset-0 z-20 flex flex-col justify-between p-6 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Map className="h-5 w-5" />
                  <span className="font-semibold text-xl tracking-tight">Route Planner</span>
                </div>
                <div className="mt-6">
                  <div className="text-7xl font-semibold tabular-nums tracking-[-4px]">{routableJobsToday}</div>
                  <div className="text-sm -mt-1 text-white/80">stops to optimize today</div>
                </div>
              </div>

              <div>
                {roughDriveMinutes !== null && (
                  <div className="text-sm mb-4 text-white/80">
                    ~{roughDriveMinutes} min total driving time
                  </div>
                )}
                <Button 
                  asChild 
                  size="lg" 
                  className="w-full bg-white text-black hover:bg-white/95 h-12 text-base font-medium rounded-none"
                  disabled={!routePlannerEnabled}
                >
                  <Link href="/dashboard/route-planner">
                    Open Route Planner →
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Page 4: Metrics + Outstanding */}
        <div className="min-w-full snap-start px-4">
          <div className="space-y-4">
            {/* Key Metrics */}
            <Card className="rounded-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <div className="border p-4">
                    <div className="text-xs text-muted-foreground">Today</div>
                    <div className="text-3xl font-semibold mt-1 tabular-nums">{jobsDueThisWeekCount}</div>
                  </div>
                  <div className="border p-4">
                    <div className="text-xs text-muted-foreground">Active Jobs</div>
                    <div className="text-3xl font-semibold mt-1 tabular-nums">{activeJobs}</div>
                  </div>
                  <div className="border p-4">
                    <div className="text-xs text-muted-foreground">MTD Revenue</div>
                    <div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600">
                      ${mtdRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div className="border p-4">
                    <div className="text-xs text-muted-foreground">Outstanding</div>
                    <div className="text-2xl font-semibold mt-1 tabular-nums text-rose-600">
                      ${totalOutstanding.toLocaleString()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Summary */}
            <Card className="rounded-none">
              <CardContent className="pt-6">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Total Outstanding</div>
                  <div className="text-6xl font-semibold tabular-nums tracking-tighter mt-1 text-rose-600">
                    ${totalOutstanding.toLocaleString()}
                  </div>
                  <div className="mt-4">
                    <Link 
                      href="/dashboard/clients" 
                      className="text-sm font-medium inline-flex items-center gap-1 text-primary"
                    >
                      View clients with outstanding bills →
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions - compact horizontal scroller, integrated into Page 4 on mobile */}
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-[1px] text-muted-foreground mb-1.5 px-1">Quick actions</div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {[
                  { label: "Clients", href: "/dashboard/clients", icon: Users },
                  { label: "Leads", href: "/dashboard/leads", icon: UserPlus },
                  { label: "New Job", href: "/dashboard/clients", icon: Briefcase },
                  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
                ].map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <Link 
                      key={i} 
                      href={a.href} 
                      className="flex items-center gap-2 border bg-card px-4 py-2.5 rounded-none text-sm whitespace-nowrap flex-shrink-0 min-h-[44px] active:bg-muted"
                    >
                      <Icon className="h-4 w-4" /> {a.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Page Indicator Dots - strict circles, no stretching */}
      <div className="flex justify-center items-center gap-2 mt-3">
        {Array.from({ length: totalPages }).map((_, index) => (
          <div
            key={index}
            onClick={() => {
              setCurrentPage(index)
              const scroller = scrollerRef.current
              if (scroller) {
                const pageWidth = scroller.clientWidth * 0.92 + 16
                scroller.scrollTo({
                  left: index * pageWidth,
                  behavior: 'smooth'
                })
              }
            }}
            className={`dashboard-page-dot rounded-full flex-shrink-0 transition-colors ${
              currentPage === index 
                ? 'w-2 h-2 bg-primary' 
                : 'w-2 h-2 bg-muted-foreground/40 hover:bg-muted-foreground/70'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
