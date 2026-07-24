'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { NavigationProvider } from '@/components/navigation/navigation-provider'
import { PortalShellProvider } from '@/components/portal/portal-shell-context'
import type { PortalShellData } from '@/lib/portal-auth'
import { PortalScrollMain } from '@/components/portal/portal-scroll-main'
import { PortalSidebar } from '@/components/portal/portal-sidebar'
import { usePersonalization } from '@/components/personalization-provider'
import { shellBackgroundClass } from '@/lib/personalization'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { exitClientPortalPreviewAction } from '@/app/action'
import { Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface PortalShellProps {
  shellData: PortalShellData
  children: React.ReactNode
}

export function PortalShell({ shellData, children }: PortalShellProps) {
  const router = useRouter()
  const { backgroundImageUrl } = usePersonalization()
  const hasAppBackground = Boolean(backgroundImageUrl)
  const [isExitingPreview, setIsExitingPreview] = useState(false)

  const handleExitPreview = async () => {
    setIsExitingPreview(true)
    const result = await exitClientPortalPreviewAction()
    if (result.success) {
      router.push(result.returnPath)
      router.refresh()
      return
    }
    toast.error(result.error || 'Failed to exit preview')
    router.push(result.returnPath || '/dashboard/clients')
    setIsExitingPreview(false)
  }

  return (
    <NavigationProvider>
      <PortalShellProvider data={shellData}>
      <div
        data-app-shell
        className={cn(
          'flex h-[100dvh] flex-col md:flex-row overflow-hidden',
          shellBackgroundClass(hasAppBackground)
        )}
      >
        <PortalSidebar
          clientName={shellData.clientName}
          companyName={shellData.companyName}
          companyLogoRef={shellData.companyLogoRef}
          isPreview={Boolean(shellData.isPreview)}
          onExitPreview={shellData.isPreview ? () => void handleExitPreview() : undefined}
          isExitingPreview={isExitingPreview}
        />
        <PortalScrollMain className="flex-1 min-h-0 min-w-0">
          {shellData.isPreview ? (
            <div className="sticky top-0 z-20 border-b border-amber-300/60 bg-amber-50 px-4 py-2.5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-50">
              <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2 text-sm">
                  <Eye className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="font-medium">Staff preview — {shellData.clientName}</p>
                    <p className="text-xs text-amber-900/80 dark:text-amber-100/80">
                      You are viewing the client portal as staff. Payments, messages, and
                      signatures are disabled.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-amber-400/70 bg-background/80"
                  disabled={isExitingPreview}
                  onClick={() => void handleExitPreview()}
                >
                  {isExitingPreview ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Exit preview
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 max-md:p-4 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {children}
          </div>
        </PortalScrollMain>
      </div>
      </PortalShellProvider>
    </NavigationProvider>
  )
}