import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { createClient } from '@/lib/supabase/server'
import { getStatusColor } from '@/lib/status-colors'
import { DashboardCharts } from './DashboardCharts'
import RoutePlannerPreviewWrapper from './RoutePlannerPreviewWrapper'
import { SubscriptionStatus } from '@/components/subscription-status'
import MobileDashboardPager from './MobileDashboardPager'
import {
  Users,
  Briefcase,
  Clock,
  CheckCircle,
  DollarSign,
  MessageCircle,
  Calendar,
  AlertTriangle,
  TrendingUp,
  UserPlus,
  CalendarDays,
  AlertCircle,
  Target,
  BarChart3,
  Map
} from "lucide-react"

export default async function Dashboard() {
  const supabase = await createClient()

  // Auth context for explicit settings fetch (RLS still applies to other tables)
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch all data (RLS scopes most tables automatically; explicit eq for singleton settings)
  const [
    { count: totalClients },
    { count: totalJobs },
    { data: activeJobsData },
    { data: completedThisMonth },
    { data: revenueData },
    { data: unreadMessages },
    { data: jobsDueThisWeek },
    { data: overdueJobs },
    { data: outstandingBills },
    { data: newClientsThisMonth },
    { data: allJobs },
    { data: leadsData },
    { data: settingsData },
    { data: mtdPaidBills }
  ] = await Promise.all([
    supabase.from('clients').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*', { count: 'exact', head: true }),
    supabase.from('jobs').select('*').in('status', ['scheduled', 'in_progress', 'quote_sent']),
    supabase.from('jobs').select('*').eq('status', 'completed').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from('bills').select('amount').eq('status', 'paid'),
    supabase.from('messages').select('*').eq('is_from_client', true).eq('read', false),
    // Fetch jobs scheduled from the start of today through the next 7 days.
    // This ensures jobs scheduled earlier today still appear.
    supabase.from('jobs')
      .select('*, clients(address, latitude, longitude)')
      .not('scheduled_date', 'is', null)
      .gte('scheduled_date', (() => {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        return startOfDay.toISOString();
      })())
      .lte('scheduled_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('jobs').select('*').eq('status', 'in_progress').lt('scheduled_date', new Date().toISOString()),
    supabase.from('bills').select('amount').eq('status', 'pending'),
    supabase.from('clients').select('*').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    supabase.from('jobs').select('price, status'),
    supabase.from('leads').select('id, created_at'),   // for pipeline glance + age buckets
    supabase.from('company_settings')
      .select('lead_fresh_days, lead_stale_days, job_statuses, primary_color, route_planner_enabled, mapbox_access_token')
      .eq('user_id', user?.id || '')
      .single(),
    // Dedicated MTD paid bills (for "Revenue this month" proxy — more accurate than filtering the all-time list)
    supabase.from('bills')
      .select('amount, created_at')
      .eq('status', 'paid')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
  ])

  // Company settings (with safe defaults matching Settings/Leads page)
  // Explicit type to satisfy strict TS checking on Vercel (settingsData from .single() can be null)
  type CompanySettings = {
    lead_fresh_days?: number
    lead_stale_days?: number
    job_statuses?: any[]
    primary_color?: string
    route_planner_enabled?: boolean
    mapbox_access_token?: string
  }
  const companySettings = (settingsData ?? {}) as CompanySettings
  const leadFreshDays = companySettings.lead_fresh_days ?? 7
  const leadStaleDays = companySettings.lead_stale_days ?? 30
  const jobStatusCustomColors = companySettings.job_statuses || []
  const primaryColor = companySettings.primary_color || null
  const routePlannerEnabled = companySettings.route_planner_enabled ?? false
  const hasMapboxToken = !!companySettings.mapbox_access_token

  // Build a quick lookup for custom status colors (reuse lib/status-colors pattern later)
  const customColorMap: Record<string, string> = {}
  if (Array.isArray(jobStatusCustomColors)) {
    for (const s of jobStatusCustomColors) {
      if (s?.key && s?.color) customColorMap[s.key] = s.color
    }
  }

  // Calculations
  const activeJobs = activeJobsData?.length || 0
  const completedThisMonthCount = completedThisMonth?.length || 0
  const totalRevenue = revenueData?.reduce((sum, bill) => sum + (bill.amount || 0), 0) || 0
  const unreadMessageCount = unreadMessages?.length || 0
  const jobsDueThisWeekCount = jobsDueThisWeek?.length || 0
  const overdueJobsCount = overdueJobs?.length || 0
  const totalOutstanding = outstandingBills?.reduce((sum: number, bill: any) => sum + (bill.amount || 0), 0) || 0
  const newClientsThisMonthCount = newClientsThisMonth?.length || 0
  const totalJobsCount = allJobs?.length || 0
  const averageJobValue = totalJobsCount > 0
    ? Math.round((allJobs?.reduce((sum: number, job: any) => sum + (job.price || 0), 0) || 0) / totalJobsCount)
    : 0
  const completionRate = totalJobsCount > 0
    ? Math.round((completedThisMonthCount / totalJobsCount) * 100)
    : 0

  // MTD Revenue (from the dedicated recent paid bills query)
  const mtdRevenue = (mtdPaidBills || []).reduce((sum: number, bill: any) => sum + (bill.amount || 0), 0)

  // Job status distribution (for visual breakdown in Pipeline section)
  const statusDistribution: Record<string, number> = {}
  if (allJobs) {
    for (const job of allJobs) {
      const st = job.status || 'unknown'
      statusDistribution[st] = (statusDistribution[st] || 0) + 1
    }
  }

  // === Leads Pipeline (age-based "promising" buckets) — now respects live company_settings thresholds ===
  const totalLeads = leadsData?.length || 0
  const now = Date.now()

  let freshLeads = 0
  let agingLeads = 0
  let staleLeads = 0

  if (leadsData) {
    for (const lead of leadsData) {
      const ageDays = Math.floor((now - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
      if (ageDays < leadFreshDays) freshLeads++
      else if (ageDays < leadStaleDays) agingLeads++
      else staleLeads++
    }
  }

  // === Chart data preparation (real derived data from existing jobs/bills) ===
  // Revenue trend for last 6 months (bucketed from paid bills)
  const revenueTrendData = (() => {
    const months: { month: string; revenue: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const monthKey = d.toISOString().slice(0, 7) // YYYY-MM
      const label = d.toLocaleString('default', { month: 'short' })
      let sum = 0
      if (revenueData) {
        for (const bill of revenueData) {
          const billDate = (bill as any).created_at ? new Date((bill as any).created_at) : null
          if (billDate && billDate.toISOString().slice(0, 7) === monthKey) {
            sum += (bill as any).amount || 0
          }
        }
      }
      months.push({ month: label, revenue: Math.round(sum) })
    }
    return months
  })()

  // Status distribution formatted for Recharts Pie
  const statusPieData = Object.entries(statusDistribution).map(([name, value]) => ({
    name: name.replace(/_/g, ' '),
    value,
    color: customColorMap[name] || getStatusColor(name)
  }))

  // === Professional Dashboard Layout ===
  // Goal: Competitive with ServiceTitan / Jobber / Housecall Pro — visual, data-rich, widget-based.
  // Uses real data where possible + polished UI for areas that will get richer data later.
  const compactMetrics = [
    {
      label: "Today",
      value: jobsDueThisWeekCount,
      sub: overdueJobsCount > 0 ? `${overdueJobsCount} overdue` : "on track",
      icon: CalendarDays,
      color: overdueJobsCount > 0 ? "text-red-600" : "text-green-600",
      href: "/dashboard/calendar"
    },
    {
      label: "Active",
      value: activeJobs,
      sub: "in progress",
      icon: Clock,
      color: "text-orange-600",
      href: "/dashboard/clients"
    },
    {
      label: "Leads",
      value: totalLeads,
      sub: `${freshLeads} fresh • ${staleLeads} stale`,
      icon: UserPlus,
      color: staleLeads > 0 ? "text-red-600" : freshLeads > 0 ? "text-green-600" : "text-amber-600",
      href: "/dashboard/leads"
    },
    {
      label: "MTD Revenue",
      value: `$${mtdRevenue.toLocaleString()}`,
      sub: "paid this month",
      icon: DollarSign,
      color: "text-emerald-600",
      href: null
    },
    {
      label: "Outstanding",
      value: `$${totalOutstanding.toLocaleString()}`,
      sub: "pending",
      icon: AlertTriangle,
      color: totalOutstanding > 0 ? "text-rose-600" : "text-green-600",
      href: "/dashboard/clients"
    },
    {
      label: "Overdue",
      value: overdueJobsCount,
      sub: overdueJobsCount > 0 ? "needs action" : "all clear",
      icon: AlertCircle,
      color: overdueJobsCount > 0 ? "text-red-600" : "text-green-600",
      href: "/dashboard/calendar"
    },
  ]

  // Separate jobs by calendar day for better Today vs Upcoming experience
  const todayJobs = (jobsDueThisWeek || []).filter((job: any) =>
    new Date(job.scheduled_date).toDateString() === new Date().toDateString()
  );

  const upcomingJobs = (jobsDueThisWeek || []).filter((job: any) =>
    new Date(job.scheduled_date).toDateString() !== new Date().toDateString()
  );

  // Count of today's jobs that have a usable address (for Route Planner card)
  const routableJobsToday = (jobsDueThisWeek || []).filter((job: any) => {
    const isToday = new Date(job.scheduled_date).toDateString() === new Date().toDateString();
    const hasAddress = job.clients?.address;
    return isToday && hasAddress;
  }).length;

  // Preview points for the dashboard Route Planner card (only those with stored coords)
  const routePreviewPoints = (jobsDueThisWeek || [])
    .filter((job: any) => {
      const isToday = new Date(job.scheduled_date).toDateString() === new Date().toDateString();
      const hasCoords = job.clients?.latitude != null && job.clients?.longitude != null;
      return isToday && hasCoords;
    })
    .map((job: any) => ({
      lat: job.clients.latitude,
      lng: job.clients.longitude,
      title: job.title || 'Job',
      scheduled: job.scheduled_date,
    }))
    .sort((a: any, b: any) => new Date(a.scheduled).getTime() - new Date(b.scheduled).getTime());

  // Rough total drive time estimate for the preview card (haversine + average speed)
  const roughDriveMinutes = (() => {
    if (routePreviewPoints.length < 2) return null;

    const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    let totalKm = 0;
    for (let i = 0; i < routePreviewPoints.length - 1; i++) {
      totalKm += haversine(
        routePreviewPoints[i].lat,
        routePreviewPoints[i].lng,
        routePreviewPoints[i + 1].lat,
        routePreviewPoints[i + 1].lng
      );
    }

    // Assume average speed of 45 km/h + 4 min buffer per leg
    const driveMinutes = Math.round((totalKm / 45) * 60);
    const buffer = (routePreviewPoints.length - 1) * 4;
    return driveMinutes + buffer;
  })();

  return (
    <div className="space-y-6">
      {/* Clean professional header - more breathing room on mobile */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back — here's your business at a glance.</p>
        </div>
        {primaryColor && (
          <div className="text-xs px-3 py-1.5 self-start sm:self-auto" style={{ backgroundColor: primaryColor + '20', color: primaryColor }}>
            Branded view
          </div>
        )}
      </div>

      <SubscriptionStatus />

      {/* Top metrics row — more comfortable spacing on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {compactMetrics.map((m, i) => {
          const Icon = m.icon
          const content = (
            <div className="flex items-center gap-3 border bg-card px-4 py-3.5 hover:shadow-md transition-all">
              <Icon className={`h-5 w-5 ${m.color} flex-shrink-0`} />
              <div className="min-w-0">
                <div className="text-2xl font-semibold leading-none tracking-tighter">{m.value}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2 truncate">{m.label}</div>
                <div className="text-xs text-muted-foreground -mt-0.5">{m.sub}</div>
              </div>
            </div>
          )
          return m.href ? (
            <Link key={i} href={m.href} className="block">{content}</Link>
          ) : (
            <div key={i}>{content}</div>
          )
        })}
      </div>

      {/* Main professional widget area - Desktop only */}
      <div className="hidden lg:block grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Today Schedule + Revenue Trend (takes significant real estate) */}
        <div className="xl:col-span-7 space-y-5">
          {/* Today Hero */}
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                <CardTitle className="text-base">Today &amp; Upcoming</CardTitle>
                <span className="text-xs text-muted-foreground">({jobsDueThisWeekCount} jobs)</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link href="/dashboard/calendar">View calendar →</Link>
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Left third - Today */}
                <div className="md:col-span-1 md:border-r md:pr-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Today</div>
                    <div className="text-xs text-muted-foreground">{todayJobs.length} jobs</div>
                  </div>

                  {todayJobs.length > 0 ? (
                    <div className="space-y-2">
                      {todayJobs
                        .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
                        .map((job: any) => {
                          const color = customColorMap[job.status] || getStatusColor(job.status);
                          return (
                            <div key={job.id} className="border p-2 text-xs hover:bg-muted/50">
                              <div className="font-medium truncate">{job.title || 'Untitled job'}</div>
                              <div className="flex justify-between text-muted-foreground mt-0.5">
                                <span>
                                  {new Date(job.scheduled_date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                                </span>
                                <Badge variant="outline" style={{ borderColor: color, color }} className="text-[9px] px-1 py-0">
                                  {job.status?.replace('_', ' ')}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-6 text-center border border-dashed">
                      No jobs scheduled for today
                    </div>
                  )}
                </div>

                {/* Right two thirds - Upcoming (more compact) */}
                <div className="md:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">Upcoming (Next 7 Days)</div>
                    <div className="text-xs text-muted-foreground">{upcomingJobs.length} jobs</div>
                  </div>

                  {upcomingJobs.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                      {upcomingJobs
                        .sort((a: any, b: any) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
                        .slice(0, 8)
                        .map((job: any) => {
                          const color = customColorMap[job.status] || getStatusColor(job.status);
                          return (
                            <div 
                              key={job.id} 
                              className="min-w-[160px] flex-shrink-0 border p-2 text-xs hover:bg-muted/50"
                            >
                              <div className="font-medium truncate leading-tight mb-1">
                                {job.title || 'Untitled job'}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>
                                  {new Date(job.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                                <Badge variant="outline" style={{ borderColor: color, color }} className="text-[9px] px-1 py-0">
                                  {job.status?.replace('_', ' ')}
                                </Badge>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground py-4">No upcoming jobs in the next 7 days.</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Revenue + Job Mix Charts */}
          <Card>
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

        {/* Right column widgets */}
        <div className="xl:col-span-5 space-y-5">
          {/* Pipeline + Leads */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Leads summary */}
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <div>
                    <span className="font-semibold">{totalLeads}</span> 
                    <span className="text-muted-foreground text-sm ml-1">leads in pipeline</span>
                  </div>
                  <Link href="/dashboard/leads" className="text-xs hover:underline">Manage →</Link>
                </div>
                <div className="text-xs">
                  <span className="text-green-600 font-medium">{freshLeads} fresh</span>
                  <span className="mx-1.5">•</span>
                  <span className="text-amber-600 font-medium">{agingLeads} aging</span>
                  <span className="mx-1.5">•</span>
                  <span className="text-red-600 font-medium">{staleLeads} stale</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Route Planner Card — map as full-bleed background with clean overlays */}
          {routePlannerEnabled && (
            <Card className="relative min-h-[240px] overflow-hidden p-0 rounded-none">
              {/* Full-bleed map background */}
              <div className="absolute inset-0 z-0">
                <RoutePlannerPreviewWrapper points={routePreviewPoints} />
              </div>

              {/* Subtle top overlay for title legibility over map */}
              <div className="absolute inset-x-0 top-0 z-10 h-9 bg-gradient-to-b from-black/60 to-transparent" />

              {/* Title overlay (top left, sharp) */}
              <div className="absolute left-3 top-2 z-20 flex items-center gap-2 text-white">
                <Map className="h-4 w-4" />
                <span className="text-sm font-semibold tracking-tight">Route Planner</span>
              </div>

              {/* Small dark square only under the stats (sharp, separates from map) */}
              <div className="absolute left-3 bottom-3 z-20 bg-black/70 px-3 py-2 text-white">
                <div className="space-y-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums leading-none">{routableJobsToday}</span>
                    <span className="text-xs text-white/80">stops today</span>
                  </div>
                  {roughDriveMinutes !== null && (
                    <div className="text-[10px] text-white/70">
                      ~{roughDriveMinutes} min drive
                    </div>
                  )}
                </div>
              </div>

              {/* Button with rectangular styling (dark rectangle for contrast over the map) */}
              <div className="absolute right-3 bottom-3 z-20">
                <Button
                  asChild
                  size="sm"
                  disabled={!hasMapboxToken}
                  className="h-8 rounded-none bg-black/70 px-3 text-xs text-white hover:bg-black/85"
                >
                  <Link href="/dashboard/route-planner">
                    Open Route Planner →
                  </Link>
                </Button>
              </div>

              {/* Token warning (only when needed, overlaid) */}
              {!hasMapboxToken && (
                <div className="absolute bottom-14 left-3 right-3 z-20 text-[10px] text-yellow-200 bg-yellow-900/80 border border-yellow-700 px-2 py-1">
                  Mapbox token required — configure in Settings
                </div>
              )}
            </Card>
          )}

          {/* Needs Attention — still prominent but fits the pro widget style */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-rose-600">
                <AlertCircle className="h-4 w-4" /> Needs Attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {overdueJobsCount > 0 && (
                <div className="flex justify-between bg-red-50 px-3 py-2 text-red-700">
                  <span>{overdueJobsCount} overdue job{overdueJobsCount > 1 ? 's' : ''}</span>
                  <Link href="/dashboard/calendar" className="text-xs hover:underline">Review</Link>
                </div>
              )}
              {staleLeads > 0 && (
                <div className="flex justify-between bg-amber-50 px-3 py-2 text-amber-700">
                  <span>{staleLeads} stale lead{staleLeads > 1 ? 's' : ''}</span>
                  <Link href="/dashboard/leads" className="text-xs hover:underline">Follow up</Link>
                </div>
              )}
              {totalOutstanding > 0 && (
                <div className="flex justify-between px-1">
                  <span>${totalOutstanding.toLocaleString()} outstanding</span>
                  <Link href="/dashboard/clients" className="text-xs hover:underline">Clients</Link>
                </div>
              )}
              {overdueJobsCount === 0 && staleLeads === 0 && totalOutstanding === 0 && (
                <div className="text-green-600 py-1">All clear — great work.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile Dashboard Pager with page indicator dots (mobile only) */}
      <MobileDashboardPager
        todayJobs={todayJobs}
        upcomingJobs={upcomingJobs}
        jobsDueThisWeekCount={jobsDueThisWeekCount}
        revenueTrendData={revenueTrendData}
        statusPieData={statusPieData}
        primaryColor={primaryColor}
        mtdRevenue={mtdRevenue}
        totalLeads={totalLeads}
        freshLeads={freshLeads}
        agingLeads={agingLeads}
        staleLeads={staleLeads}
        routePlannerEnabled={routePlannerEnabled}
        routableJobsToday={routableJobsToday}
        roughDriveMinutes={roughDriveMinutes}
        routePreviewPoints={routePreviewPoints}
        overdueJobsCount={overdueJobsCount}
        totalOutstanding={totalOutstanding}
        customColorMap={customColorMap}
      />

      {/* Bottom actions row — professional and minimal (desktop + mobile) */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">Quick actions</span>
        {[
          { label: "Clients", href: "/dashboard/clients", icon: Users },
          { label: "Leads", href: "/dashboard/leads", icon: UserPlus },
          { label: "New Job (via Client)", href: "/dashboard/clients", icon: Briefcase },
          { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
        ].map((a, i) => {
          const Icon = a.icon
          return (
            <Button key={i} variant="outline" size="sm" className="h-8 px-3 text-xs" asChild>
              <Link href={a.href} className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5" /> {a.label}
              </Link>
            </Button>
          )
        })}
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground">More analytics &amp; reporting coming soon</span>
      </div>
    </div>
  )
}
