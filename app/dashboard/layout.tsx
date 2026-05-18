import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-xl">SP</span>
            </div>
            <div>
              <div className="font-bold text-xl">ServicePortal</div>
              <div className="text-xs text-muted-foreground -mt-1">Client Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4">
          <div className="space-y-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/dashboard/clients"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Clients
            </Link>
            <Link
              href="/dashboard/jobs"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Jobs
            </Link>
            <Link
  href="/dashboard/calendar"
  className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
>
  Calendar
</Link>
            <Link
              href="/dashboard/messages"
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl hover:bg-muted transition-colors"
            >
              Messages
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t flex justify-between items-center">
  <form action="/auth/signout" method="post">
    <Button type="submit" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10">
      Sign Out
    </Button>
  </form>
  <ThemeToggle />
</div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
