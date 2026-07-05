'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { SidebarNavLink } from '@/components/navigation/sidebar-nav-link'
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  FolderOpen,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const navItems = [
  { href: '/portal', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/portal/jobs', label: 'Jobs', icon: CalendarDays, exact: false },
  { href: '/portal/estimates', label: 'Estimates', icon: FileText, exact: false },
  { href: '/portal/documents', label: 'Documents', icon: FolderOpen, exact: false },
  { href: '/portal/messages', label: 'Messages', icon: MessageSquare, exact: false },
  { href: '/portal/settings', label: 'Settings', icon: Settings, exact: false },
]

interface PortalSidebarProps {
  clientName: string
  companyName: string
  companyLogo?: string | null
}

function CompanyMark({
  companyName,
  companyLogo,
  className,
}: {
  companyName: string
  companyLogo?: string | null
  className?: string
}) {
  if (companyLogo) {
    return (
      <img
        src={companyLogo}
        alt={companyName}
        className={`rounded-lg object-cover ring-1 ring-border shrink-0 ${className}`}
      />
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0 ${className}`}
    >
      <span className="text-sm font-bold">{companyName.slice(0, 2).toUpperCase()}</span>
    </div>
  )
}

function PortalNavLinks({
  pathname,
  onNavigate,
  expanded = true,
}: {
  pathname: string
  onNavigate?: () => void
  expanded?: boolean
}) {
  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href, item.exact)

        return (
          <SidebarNavLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={Icon}
            isActive={active}
            expanded={expanded}
            onNavigate={onNavigate}
          />
        )
      })}
    </nav>
  )
}

function MobilePortalHeader({
  clientName,
  companyName,
  companyLogo,
  pathname,
  isLoggingOut,
  onLogout,
}: PortalSidebarProps & {
  pathname: string
  isLoggingOut: boolean
  onLogout: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  return (
    <header className="flex md:hidden shrink-0 z-40 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur min-h-14 supports-[padding:max(0px)]:pt-[max(0px,env(safe-area-inset-top))]">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="size-5" />
        </Button>

        <SheetContent side="left" className="w-[min(85vw,18rem)] gap-0 p-0">
          <SheetHeader className="border-b p-4 text-left">
            <div className="flex items-center gap-3 pr-8">
              <CompanyMark companyName={companyName} companyLogo={companyLogo} className="h-9 w-9" />
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">{companyName}</SheetTitle>
                <p className="text-xs text-muted-foreground truncate">{clientName}</p>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-3">
            <PortalNavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </div>

          <div className="mt-auto border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-3 px-3"
              onClick={onLogout}
              disabled={isLoggingOut}
            >
              <LogOut className="size-5 shrink-0" />
              {isLoggingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <CompanyMark companyName={companyName} companyLogo={companyLogo} className="h-8 w-8" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold tracking-tight">{companyName}</p>
        <p className="truncate text-xs text-muted-foreground">{clientName}</p>
      </div>
    </header>
  )
}

function DesktopPortalSidebar({
  clientName,
  companyName,
  companyLogo,
  pathname,
  isLoggingOut,
  onLogout,
}: PortalSidebarProps & {
  pathname: string
  isLoggingOut: boolean
  onLogout: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <aside
      className={`hidden md:flex h-full shrink-0 flex-col bg-background transition-[width] duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex h-16 shrink-0 items-center px-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyMark companyName={companyName} companyLogo={companyLogo} className="h-8 w-8" />
          <span
            className={`overflow-hidden whitespace-nowrap text-lg font-semibold tracking-tight text-muted-foreground transition-all duration-150 ${
              isExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            {companyName}
          </span>
        </div>
      </div>

      <div className="mx-2 mb-2 shrink-0">
        <div
          className={`flex h-[3.25rem] items-center overflow-hidden rounded-lg bg-muted/50 p-2 ${
            !isExpanded ? 'justify-center' : ''
          }`}
        >
          <div
            className={`flex min-w-0 items-center ${isExpanded ? 'w-full gap-3' : 'gap-0'}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
              <span className="text-xs font-medium">{clientName.slice(0, 2).toUpperCase()}</span>
            </div>
            <div
              className={`min-w-0 overflow-hidden transition-all duration-150 ${
                isExpanded ? 'flex-1 opacity-100' : 'w-0 flex-none opacity-0'
              }`}
            >
              <div className="truncate text-sm font-medium leading-5">{clientName}</div>
              <div className="truncate text-xs leading-4 text-muted-foreground">Client portal</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 p-2 flex-1 min-h-0">
        <PortalNavLinks pathname={pathname} expanded={isExpanded} />
      </div>

      <div className="mt-auto p-2">
        <button
          type="button"
          onClick={onLogout}
          disabled={isLoggingOut}
          className={`flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${
            !isExpanded ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span
            className={`ml-3 overflow-hidden whitespace-nowrap transition-all duration-150 ${
              isExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            {isLoggingOut ? 'Signing out...' : 'Sign out'}
          </span>
        </button>
      </div>
    </aside>
  )
}

export function PortalSidebar(props: PortalSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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

  return (
    <>
      <MobilePortalHeader
        {...props}
        pathname={pathname}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      />
      <DesktopPortalSidebar
        {...props}
        pathname={pathname}
        isLoggingOut={isLoggingOut}
        onLogout={handleLogout}
      />
    </>
  )
}