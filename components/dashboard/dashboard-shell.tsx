'use client'

import { DashboardScrollMain } from '@/components/dashboard/dashboard-scroll-main'
import {
  DashboardShellProvider,
  type DashboardShellData,
} from '@/components/dashboard/dashboard-shell-context'
import { DashboardTrialBanner } from '@/components/dashboard/dashboard-trial-banner'
import { Sidebar } from '@/components/dashboard/sidebar'
import { NavigationProvider } from '@/components/navigation/navigation-provider'
import { usePersonalization } from '@/components/personalization-provider'
import { shellBackgroundClass } from '@/lib/personalization'
import { cn } from '@/lib/utils'

export function DashboardShell({
  children,
  initialShellData = null,
}: {
  children: React.ReactNode
  initialShellData?: DashboardShellData | null
}) {
  const { backgroundImageUrl } = usePersonalization()
  const hasAppBackground = Boolean(backgroundImageUrl)

  return (
    <NavigationProvider>
      <DashboardShellProvider initialData={initialShellData}>
        <div
          data-app-shell
          className={cn(
            'flex h-dvh flex-col md:flex-row overflow-hidden',
            shellBackgroundClass(hasAppBackground)
          )}
        >
          <Sidebar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DashboardTrialBanner />
            <DashboardScrollMain>{children}</DashboardScrollMain>
          </div>
        </div>
      </DashboardShellProvider>
    </NavigationProvider>
  )
}