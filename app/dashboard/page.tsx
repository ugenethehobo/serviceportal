import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CurrentTimeIndicator } from '@/components/dashboard/current-time-indicator'
import { JobBar } from '@/components/dashboard/job-bar'

const jobs = [
  {
    id: 1,
    startTime: '08:00',
    durationMinutes: 60,
    title: 'Leaking Faucet',
    crew: 'North Crew',
    location: '1247 Pine Rd',
    status: 'Completed' as const,
    top: 'top-0',
  },
  {
    id: 2,
    startTime: '09:30',
    durationMinutes: 90,
    title: 'Water Heater Install',
    crew: 'North Crew',
    location: '4821 Maple Ave',
    status: 'In Progress' as const,
    top: 'top-9',
  },
  {
    id: 3,
    startTime: '11:00',
    durationMinutes: 60,
    title: 'Drain Cleaning',
    crew: 'East Crew',
    location: '3902 Elm St',
    status: 'Completed' as const,
    top: 'top-0',
  },
  {
    id: 4,
    startTime: '13:30',
    durationMinutes: 90,
    title: 'Sewer Line Inspection',
    crew: 'South Crew',
    location: '2150 River Rd',
    status: 'Scheduled' as const,
    top: 'top-9',
  },
]

export default function DashboardPage() {
  return (
    <div className="h-full p-4 flex flex-col gap-4">

      {/* Top Card - Crews + Jobs */}
      <Card className="flex-[3] p-4 flex flex-col min-h-0 shadow-sm bg-card">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-0 overflow-hidden">

          {/* Crews Section */}
          <div className="lg:col-span-2 lg:border-r lg:pr-6 flex flex-col min-h-0 border-border/70">
            <h2 className="text-lg font-semibold tracking-tight mb-3 pb-2 border-b flex-shrink-0">
              Active Crews Today
            </h2>
            <div className="scroll-fade space-y-3 overflow-auto flex-1 pr-1">
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">North Crew</div>
                    <div className="text-xs text-muted-foreground">Mike, Carlos, Jamal</div>
                  </div>
                  <Badge variant="default" className="text-xs">On Job</Badge>
                </div>
                <div className="mt-2 text-xs">
                  3 jobs today • Currently at: 4821 Maple Ave
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">South Crew</div>
                    <div className="text-xs text-muted-foreground">Derek, Luis</div>
                  </div>
                  <Badge variant="secondary" className="text-xs">Available</Badge>
                </div>
                <div className="mt-2 text-xs">
                  2 jobs today • Next job at 1:30 PM
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-sm">East Crew</div>
                    <div className="text-xs text-muted-foreground">Tyler, Marcus, Sam</div>
                  </div>
                  <Badge variant="default" className="text-xs">On Job</Badge>
                </div>
                <div className="mt-2 text-xs">
                  4 jobs today • Currently at: 1290 Oak Street
                </div>
              </div>
            </div>
          </div>

          {/* Jobs Timeline Section */}
          <div className="lg:col-span-3 lg:pl-6 flex flex-col min-h-0">
            <h2 className="text-lg font-semibold tracking-tight mb-3 pb-2 border-b flex-shrink-0">
              Today's Jobs Timeline
            </h2>
            <div className="relative flex-1 min-h-0">
              <div className="relative pt-8 pb-4 flex-1">
                {/* Base Timeline Line */}
                <div className="absolute top-6 left-0 right-0 h-px bg-border" />

                {/* Light Grey Vertical Grid Lines */}
                <div className="absolute top-6 bottom-0 left-0 right-0 flex justify-between px-1 pointer-events-none">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="w-px h-full bg-muted-foreground/20" />
                  ))}
                </div>

                {/* Time Labels */}
                <div className="absolute top-6 left-0 right-0 flex justify-between text-[10px] text-muted-foreground px-1 -mt-5">
                  <div>8:00</div>
                  <div>9:00</div>
                  <div>10:00</div>
                  <div>11:00</div>
                  <div>12:00</div>
                  <div>1:00</div>
                  <div>2:00</div>
                  <div>3:00</div>
                  <div>4:00</div>
                  <div>5:00</div>
                </div>

                {/* Current Time Indicator */}
                <CurrentTimeIndicator />

                {/* Job Bars with Hover Cards */}
                <div className="relative mt-8 h-20">
                  {jobs.map((job) => (
                    <JobBar key={job.id} {...job} />
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </Card>

      {/* Bottom Card - Live Map */}
      <Card className="flex-[7] p-4 flex flex-col min-h-0 shadow-sm">
        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h2 className="text-lg font-semibold tracking-tight">Live Crew Locations</h2>
          <Badge variant="outline" className="text-xs">Live</Badge>
        </div>

        <div className="flex-1 relative rounded-lg border bg-muted/40 flex items-center justify-center overflow-hidden">
          <div className="text-center z-10">
            <div className="text-sm text-muted-foreground">Map View</div>
            <p className="text-xs text-muted-foreground mt-1">
              Crew locations + active jobs will display here
            </p>
          </div>

          {/* Fake location pins */}
          <div className="absolute top-[30%] left-[20%] flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full ring-4 ring-blue-500/20" />
            <span className="text-[10px] bg-background px-1 py-0.5 rounded shadow-sm">North Crew</span>
          </div>
          <div className="absolute top-[45%] right-[25%] flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded-full ring-4 ring-green-500/20" />
            <span className="text-[10px] bg-background px-1 py-0.5 rounded shadow-sm">East Crew</span>
          </div>
          <div className="absolute bottom-[22%] left-[42%] flex items-center gap-1">
            <div className="w-2 h-2 bg-orange-500 rounded-full ring-4 ring-orange-500/20" />
            <span className="text-[10px] bg-background px-1 py-0.5 rounded shadow-sm">South Crew</span>
          </div>
        </div>
      </Card>

    </div>
  )
}
