import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import SidebarNav from './sidebar'
import { SubscriptionStatus } from '@/components/subscription-status'

export async function generateMetadata() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      title: 'ServicePortal',
      icons: { icon: '/favicon.ico' }
    }
  }

  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, logo_url')
    .eq('user_id', user.id)
    .single()

  const companyName = settings?.company_name || 'ServicePortal'
  const logoUrl = settings?.logo_url

  return {
    title: `${companyName} | ServicePortal`,
    icons: {
      icon: logoUrl || '/favicon.ico',           // Use uploaded logo or fallback
    },
  }
}

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

  // Fetch company settings for sidebar branding
  const { data: settings } = await supabase
    .from('company_settings')
    .select('company_name, logo_url')
    .eq('user_id', user.id)
    .single()

  const companyName = settings?.company_name || 'ServicePortal'
  const logoUrl = settings?.logo_url

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r bg-card flex flex-col">
        {/* Dynamic Logo / Branding */}
        <div className="p-6 border-b">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-10 h-10 object-contain rounded-2xl"
              />
            ) : (
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-xl">SP</span>
              </div>
            )}
            <div>
              <div className="font-bold text-xl">{companyName}</div>
              <div className="text-xs text-muted-foreground -mt-1">Client Portal</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <SidebarNav />

        {/* Bottom Section */}
        <div className="p-4 border-t flex justify-between items-center">
          <form action="/auth/signout" method="post">
            <Button
              type="submit"
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Sign Out
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <SubscriptionStatus />
          {children}
        </div>
      </div>
    </div>
  )
}
