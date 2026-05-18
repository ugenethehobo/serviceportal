import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function Dashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2 text-lg">Welcome back! Here's what's happening with your business.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">1</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">1</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-orange-600">1</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-green-600">0</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-emerald-600">$0</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto p-6 justify-start" asChild>
              <Link href="/dashboard/clients">
                <div className="text-left">
                  <div className="font-semibold">Manage Clients</div>
                  <div className="text-sm text-muted-foreground">Add or view clients</div>
                </div>
              </Link>
            </Button>

            <Button variant="outline" className="h-auto p-6 justify-start" asChild>
              <Link href="/dashboard/jobs">
                <div className="text-left">
                  <div className="font-semibold">Manage Jobs</div>
                  <div className="text-sm text-muted-foreground">Create and track jobs</div>
                </div>
              </Link>
            </Button>

            <Button variant="outline" className="h-auto p-6 justify-start" disabled>
              <div className="text-left">
                <div className="font-semibold">View Reports</div>
                <div className="text-sm text-muted-foreground">Coming soon</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
