'use client'

import { DashboardScrollMain } from '@/components/dashboard/dashboard-scroll-main'
import { DashboardTrialBanner } from '@/components/dashboard/dashboard-trial-banner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { NavigationProvider } from '@/components/navigation/navigation-provider'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProvider>
      <div className="flex h-dvh flex-col md:flex-row bg-background overflow-hidden">
        <Sidebar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DashboardTrialBanner />
          <DashboardScrollMain>{children}</DashboardScrollMain>
        </div>
      </div>
    </NavigationProvider>
  )
}