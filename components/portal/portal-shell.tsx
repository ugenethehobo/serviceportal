'use client'

import { NavigationProvider } from '@/components/navigation/navigation-provider'
import { PortalShellProvider } from '@/components/portal/portal-shell-context'
import type { PortalShellData } from '@/lib/portal-auth'
import { PortalScrollMain } from '@/components/portal/portal-scroll-main'
import { PortalSidebar } from '@/components/portal/portal-sidebar'

interface PortalShellProps {
  shellData: PortalShellData
  children: React.ReactNode
}

export function PortalShell({ shellData, children }: PortalShellProps) {
  return (
    <NavigationProvider>
      <PortalShellProvider data={shellData}>
      <div className="flex h-[100dvh] flex-col md:flex-row bg-background overflow-hidden">
        <PortalSidebar
          clientName={shellData.clientName}
          companyName={shellData.companyName}
          companyLogo={shellData.companyLogo}
        />
        <PortalScrollMain className="flex-1 min-h-0 min-w-0">
          <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </PortalScrollMain>
      </div>
      </PortalShellProvider>
    </NavigationProvider>
  )
}