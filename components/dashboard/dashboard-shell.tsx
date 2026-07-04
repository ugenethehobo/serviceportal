'use client'

import { DashboardScrollMain } from '@/components/dashboard/dashboard-scroll-main'
import { Sidebar } from '@/components/dashboard/sidebar'
import { NavigationProvider } from '@/components/navigation/navigation-provider'

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <NavigationProvider>
      <div className="flex h-dvh flex-col md:flex-row bg-background overflow-hidden">
        <Sidebar />
        <DashboardScrollMain>{children}</DashboardScrollMain>
      </div>
    </NavigationProvider>
  )
}