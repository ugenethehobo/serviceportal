'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { SidebarNavLink } from '@/components/navigation/sidebar-nav-link'
import { LogOut, Menu } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDashboardShell } from '@/components/dashboard/dashboard-shell-context'
import { SidebarBetaSunsetNotice } from '@/components/dashboard/sidebar-beta-sunset-notice'
import { SidebarSubscriptionIndicator } from '@/components/dashboard/sidebar-subscription-indicator'
import type { CompanySubscriptionAccess } from '@/lib/platform-trial'

import { CompanyLogoImage } from '@/components/dashboard/company-logo-image'
import { subscribeCompanyBrandingUpdates } from '@/lib/company-branding'
import {
  getDashboardNavItems,
  isDashboardNavItemActive,
  type DashboardNavItemWithAccess,
} from '@/lib/dashboard-nav'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { usePersonalization } from '@/components/personalization-provider'
import {
  chromeBackgroundClass,
  chromeHeaderBackgroundClass,
  chromeMobileSheetClass,
} from '@/lib/personalization'
import { cn } from '@/lib/utils'

interface UserProfile {
  id: string
  full_name: string
  avatar_url?: string | null
  role?: string
  company_id?: string
}

interface Company {
  id: string
  name: string
  logo_url?: string | null
}

function useDashboardNav() {
  const router = useRouter()
  const supabase = createClient()
  const pathname = usePathname()
  const { data: shellData } = useDashboardShell()
  const [companyOverride, setCompanyOverride] = useState<Partial<Company> | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const userProfile: UserProfile | null = shellData
    ? {
        id: shellData.profile.id,
        full_name: shellData.profile.full_name,
        avatar_url: shellData.profile.avatar_url,
        role: shellData.profile.role,
        company_id: shellData.profile.company_id ?? undefined,
      }
    : null

  const company: Company | null = shellData?.company
    ? {
        ...shellData.company,
        ...(companyOverride ?? {}),
      }
    : null

  const subscriptionAccess =
    shellData &&
    (shellData.profile.role === 'company_admin' ||
      shellData.profile.role === 'team_member')
      ? shellData.subscriptionAccess
      : null
  const betaSunsetWarning =
    shellData &&
    (shellData.profile.role === 'company_admin' ||
      shellData.profile.role === 'team_member')
      ? shellData.betaSunsetWarning
      : null
  const isSoloBusiness = shellData?.isSoloBusiness ?? false

  useEffect(() => {
    return subscribeCompanyBrandingUpdates((update) => {
      setCompanyOverride((current) => ({
        ...(current ?? {}),
        ...(update.name !== undefined ? { name: update.name } : {}),
        ...(update.logo_url !== undefined ? { logo_url: update.logo_url } : {}),
      }))
    })
  }, [])

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Error logging out:', error)
      setIsLoggingOut(false)
    }
  }

  const displayName = userProfile?.full_name || 'User'
  const displayRole =
    userProfile?.role === 'team_member'
      ? 'Team Member'
      : userProfile?.role === 'company_admin'
        ? 'Admin'
        : userProfile?.role || 'Member'
  const companyName = company?.name || 'Your Company'
  const companyLogoRef = company?.logo_url
  const visibleNavItems = getDashboardNavItems(
    userProfile?.role,
    subscriptionAccess?.plan,
    isSoloBusiness,
    {
      isCrewLead: shellData?.isCrewLead === true,
      crewLabel: shellData?.crewLabel,
    }
  )

  return {
    pathname,
    userProfile,
    displayName,
    displayRole,
    companyName,
    companyLogoRef,
    visibleNavItems,
    subscriptionAccess,
    betaSunsetWarning,
    isLoggingOut,
    handleLogout,
  }
}

function UserAvatar({
  displayName,
  avatarUrl,
  className,
  subscriptionAccess,
  showSubscriptionDot = false,
}: {
  displayName: string
  avatarUrl?: string | null
  className?: string
  subscriptionAccess?: CompanySubscriptionAccess | null
  showSubscriptionDot?: boolean
}) {
  const avatar = avatarUrl ? (
    <img
      src={avatarUrl}
      alt={displayName}
      className={cn('rounded-full object-cover ring-1 ring-border', className)}
    />
  ) : (
    <div
      className={cn(
        'rounded-full bg-muted ring-1 ring-border flex items-center justify-center',
        className
      )}
    >
      <span className="text-xs font-medium">{displayName.slice(0, 2).toUpperCase()}</span>
    </div>
  )

  if (!showSubscriptionDot || !subscriptionAccess) {
    return avatar
  }

  return (
    <div className="relative shrink-0">
      {avatar}
      <SidebarSubscriptionIndicator access={subscriptionAccess} expanded={false} />
    </div>
  )
}

function DashboardNavLinks({
  items,
  pathname,
  expanded = true,
  onNavigate,
}: {
  items: DashboardNavItemWithAccess[]
  pathname: string
  expanded?: boolean
  onNavigate?: () => void
}) {
  return (
    <TooltipProvider>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = isDashboardNavItemActive(pathname, item.href)
          const Icon = item.icon

          return (
            <SidebarNavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={Icon}
              isActive={isActive}
              expanded={expanded}
              onNavigate={onNavigate}
              locked={item.locked}
              upgradeMessage={item.upgradeMessage}
            />
          )
        })}
      </nav>
    </TooltipProvider>
  )
}

function MobileDashboardHeader({
  pathname,
  displayName,
  displayRole,
  companyName,
  companyLogoRef,
  visibleNavItems,
  subscriptionAccess,
  betaSunsetWarning,
  userProfile,
  isLoggingOut,
  handleLogout,
  hasAppBackground,
}: ReturnType<typeof useDashboardNav> & { hasAppBackground: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <header
      className={cn(
        'flex md:hidden shrink-0 z-40 items-center gap-3 px-4 supports-[padding:max(0px)]:pt-[max(0px,env(safe-area-inset-top))] min-h-14',
        !hasAppBackground && 'border-b',
        chromeHeaderBackgroundClass(hasAppBackground)
      )}
    >
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="max-md:min-h-11 max-md:min-w-11"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>

        <SheetContent
          side="left"
          className={cn(
            'flex h-full max-h-[100dvh] w-[min(85vw,18rem)] flex-col gap-0 p-0',
            chromeMobileSheetClass()
          )}
        >
          <SheetHeader className="border-b p-4 text-left">
            <div className="flex items-center gap-3 pr-8">
              <CompanyLogoImage
                logoRef={companyLogoRef}
                companyName={companyName}
                imageClassName="h-9 w-9 rounded-lg ring-1 ring-border"
                fallbackClassName="h-9 w-9 rounded-lg text-sm ring-1 ring-border"
              />
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">{companyName}</SheetTitle>
                <p className="text-xs text-muted-foreground truncate">{displayRole}</p>
              </div>
            </div>
          </SheetHeader>

          <div className="p-4 border-b">
            <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
              <UserAvatar
                displayName={displayName}
                avatarUrl={userProfile?.avatar_url}
                className="h-10 w-10 shrink-0"
                subscriptionAccess={subscriptionAccess}
                showSubscriptionDot
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{displayRole}</p>
                <SidebarSubscriptionIndicator access={subscriptionAccess} expanded />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <DashboardNavLinks
              items={visibleNavItems}
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
            <SidebarBetaSunsetNotice warning={betaSunsetWarning} expanded />
          </div>

          <div className="mt-auto border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-3 px-3"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="size-5 shrink-0" />
              {isLoggingOut ? 'Logging out…' : 'Logout'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CompanyLogoImage
        logoRef={companyLogoRef}
        companyName={companyName}
        imageClassName="h-8 w-8 rounded-lg ring-1 ring-border shrink-0"
        fallbackClassName="h-8 w-8 rounded-lg text-sm ring-1 ring-border shrink-0"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">{companyName}</p>
        <p className="truncate text-xs text-muted-foreground">{displayName}</p>
      </div>
    </header>
  )
}

function DesktopSidebar({
  pathname,
  displayName,
  displayRole,
  companyName,
  companyLogoRef,
  visibleNavItems,
  subscriptionAccess,
  betaSunsetWarning,
  userProfile,
  isLoggingOut,
  handleLogout,
  hasAppBackground,
}: ReturnType<typeof useDashboardNav> & { hasAppBackground: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <aside
      className={cn(
        'hidden md:flex h-full shrink-0 flex-col transition-[width] duration-300',
        chromeBackgroundClass(hasAppBackground),
        isExpanded ? 'w-64' : 'w-16'
      )}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex h-16 shrink-0 items-center px-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogoImage
            logoRef={companyLogoRef}
            companyName={companyName}
            imageClassName="h-8 w-8 rounded-lg ring-1 ring-border shrink-0"
            fallbackClassName="h-8 w-8 rounded-lg text-sm ring-1 ring-border shrink-0"
          />

          <span
            className={cn(
              'overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight text-muted-foreground transition-all duration-150',
              isExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
            )}
          >
            {companyName}
          </span>
        </div>
      </div>

      <div className="mx-2 mb-2 shrink-0">
        <div
          className={cn(
            'flex h-[4.75rem] items-center overflow-hidden rounded-lg bg-muted/50 p-2',
            !isExpanded && 'justify-center'
          )}
        >
          <div
            className={cn(
              'flex min-w-0 items-center',
              isExpanded ? 'w-full gap-3' : 'gap-0'
            )}
          >
            <UserAvatar
              displayName={displayName}
              avatarUrl={userProfile?.avatar_url}
              className="h-8 w-8 shrink-0"
              subscriptionAccess={subscriptionAccess}
              showSubscriptionDot={!isExpanded}
            />

            <div
              className={cn(
                'min-w-0 overflow-hidden transition-all duration-150',
                isExpanded ? 'flex-1 opacity-100' : 'w-0 flex-none opacity-0'
              )}
            >
              <div className="truncate text-sm font-medium leading-5">{displayName}</div>
              <div className="truncate text-xs leading-4 text-muted-foreground">{displayRole}</div>
              <SidebarSubscriptionIndicator access={subscriptionAccess} expanded />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 p-2 flex-1 min-h-0">
        <DashboardNavLinks
          items={visibleNavItems}
          pathname={pathname}
          expanded={isExpanded}
        />
        <SidebarBetaSunsetNotice warning={betaSunsetWarning} expanded={isExpanded} />
      </div>

      <div className="mt-auto p-2">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={cn(
            'flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            !isExpanded && 'justify-center'
          )}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span
            className={cn(
              'ml-3 overflow-hidden whitespace-nowrap transition-all duration-150',
              isExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
            )}
          >
            {isLoggingOut ? 'Logging out…' : 'Logout'}
          </span>
        </button>
      </div>
    </aside>
  )
}

export function Sidebar() {
  const nav = useDashboardNav()
  const { backgroundImageUrl } = usePersonalization()
  const hasAppBackground = Boolean(backgroundImageUrl)

  return (
    <>
      <MobileDashboardHeader {...nav} hasAppBackground={hasAppBackground} />
      <DesktopSidebar {...nav} hasAppBackground={hasAppBackground} />
    </>
  )
}