'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  CalendarDays,
  FileText,
  FolderOpen,
  LogOut,
  Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const navItems = [
  { href: '/portal', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/portal/jobs', label: 'Jobs', icon: CalendarDays, exact: false },
  { href: '/portal/estimates', label: 'Estimates', icon: FileText, exact: false },
  { href: '/portal/documents', label: 'Documents', icon: FolderOpen, exact: false },
  { href: '/portal/settings', label: 'Settings', icon: Settings, exact: false },
]

interface PortalSidebarProps {
  clientName: string
  companyName: string
  companyLogo?: string | null
}

export function PortalSidebar({ clientName, companyName, companyLogo }: PortalSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [isExpanded, setIsExpanded] = useState(false)
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

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <div
      className={`flex h-screen flex-shrink-0 flex-col bg-background transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex h-16 items-center px-4">
        <div className="flex items-center gap-3 min-w-0">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={companyName}
              className="h-8 w-8 rounded-lg object-cover ring-1 ring-border shrink-0"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <span className="text-sm font-bold">
                {companyName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}

          {isExpanded && (
            <span className="text-lg font-semibold tracking-tight text-muted-foreground truncate">
              {companyName}
            </span>
          )}
        </div>
      </div>

      <div className="mx-2 mb-2">
        <div
          className={`rounded-lg bg-muted/50 p-2 transition-all ${
            isExpanded ? '' : 'flex justify-center'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ring-1 ring-border">
              <span className="text-xs font-medium">
                {clientName.slice(0, 2).toUpperCase()}
              </span>
            </div>

            {isExpanded && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{clientName}</div>
                <div className="truncate text-xs text-muted-foreground">Client portal</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href, item.exact)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span
                className={`ml-3 overflow-hidden whitespace-nowrap transition-all duration-150 ${
                  isExpanded ? 'max-w-[180px] opacity-100' : 'max-w-0 opacity-0'
                }`}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto p-2">
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
    </div>
  )
}