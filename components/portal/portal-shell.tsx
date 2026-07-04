'use client'

import { NavigationProvider } from '@/components/navigation/navigation-provider'
import { PortalScrollMain } from '@/components/portal/portal-scroll-main'
import { PortalSidebar } from '@/components/portal/portal-sidebar'

interface PortalShellProps {
  clientName: string
  companyName: string
  companyLogo?: string | null
  children: React.ReactNode
}

export function PortalShell({
  clientName,
  companyName,
  companyLogo,
  children,
}: PortalShellProps) {
  return (
    <NavigationProvider>
      <div className="flex h-[100dvh] flex-col md:flex-row bg-background overflow-hidden">
        <PortalSidebar
          clientName={clientName}
          companyName={companyName}
          companyLogo={companyLogo}
        />
        <PortalScrollMain className="flex-1 min-h-0 min-w-0">
          <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full">{children}</div>
        </PortalScrollMain>
      </div>
    </NavigationProvider>
  )
}