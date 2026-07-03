'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  BarChart3,
  Route,
  Settings,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getDashboardUserDataAction } from '@/app/action'

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/dashboard/clients',
    label: 'Clients',
    icon: Users,
  },
  {
    href: '/dashboard/crews',
    label: 'Crews',
    icon: CheckSquare,
  },
  {
    href: '/dashboard/routes',
    label: 'Routes',
    icon: Route,
  },
  {
    href: '/dashboard/reports',
    label: 'Reports',
    icon: BarChart3,
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: Settings,
  },
]

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

export function Sidebar() {
  const router = useRouter()
  const supabase = createClient()
  const [isExpanded, setIsExpanded] = useState(false)
  const pathname = usePathname()
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    const fetchUserData = async () => {
      const result = await getDashboardUserDataAction()
      if (!result.success) {
        console.error('Error fetching profile:', result.error)
        return
      }

      setUserProfile({
        id: result.profile.id,
        full_name: result.profile.full_name,
        avatar_url: result.profile.avatar_url,
        role: result.profile.role,
        company_id: result.profile.company_id ?? undefined,
      })

      if (result.company) {
        setCompany(result.company)
      }
    }

    fetchUserData()
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
  const displayRole = userProfile?.role || 'Member'
  const companyName = company?.name || 'Your Company'
  const companyLogo = company?.logo_url

  return (
    <div
      className={`flex h-screen flex-shrink-0 flex-col bg-background transition-all duration-300 ${
        isExpanded ? 'w-64' : 'w-16'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex h-16 items-center px-4">
        <div className="flex items-center gap-3">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={companyName}
              className="h-8 w-8 rounded-lg object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
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
            {userProfile?.avatar_url ? (
              <img
                src={userProfile.avatar_url}
                alt={displayName}
                className="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="h-8 w-8 flex-shrink-0 rounded-full bg-muted ring-1 ring-border flex items-center justify-center">
                <span className="text-xs font-medium">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}

            {isExpanded && (
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{displayRole}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span
                className={`ml-3 overflow-hidden whitespace-nowrap transition-all duration-150 ${
                  isExpanded
                    ? 'max-w-[180px] opacity-100'
                    : 'max-w-0 opacity-0'
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
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span
            className={`ml-3 overflow-hidden whitespace-nowrap transition-all duration-150 ${
              isExpanded
                ? 'max-w-[180px] opacity-100'
                : 'max-w-0 opacity-0'
            }`}
          >
            Logout
          </span>
        </button>
      </div>
    </div>
  )
}