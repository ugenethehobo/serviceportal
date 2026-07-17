'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { getDashboardShellDataAction } from '@/app/action'
import type { BetaSunsetWarning } from '@/lib/platform-release-schedule'
import type { CompanySubscriptionAccess } from '@/lib/platform-trial'

export type DashboardShellProfile = {
  id: string
  full_name: string
  avatar_url: string | null
  role: string
  company_id: string | null
  crew_id: string | null
}

export type DashboardShellCompany = {
  id: string
  name: string
  logo_url: string | null
}

export type DashboardShellData = {
  profile: DashboardShellProfile
  company: DashboardShellCompany | null
  subscriptionAccess: CompanySubscriptionAccess | null
  betaSunsetWarning: BetaSunsetWarning | null
  isSoloBusiness: boolean
  soloCrewId: string | null
  role: string
  /** Company admin is designated crew lead (P4). */
  isCrewLead?: boolean
  /** Custom plural label for crews (default "Crews"). */
  crewLabel?: string
}

type DashboardShellContextValue = {
  data: DashboardShellData | null
  refresh: () => Promise<void>
}

const DashboardShellContext = createContext<DashboardShellContextValue | null>(null)

export function DashboardShellProvider({
  children,
  initialData,
}: {
  children: ReactNode
  initialData: DashboardShellData | null
}) {
  const [data, setData] = useState(initialData)

  const refresh = useCallback(async () => {
    const result = await getDashboardShellDataAction()
    if (result.success) {
      setData(result.data)
    }
  }, [])

  useEffect(() => {
    const handleProfileUpdated = () => {
      void refresh()
    }

    window.addEventListener('dashboard-profile-updated', handleProfileUpdated)
    return () =>
      window.removeEventListener('dashboard-profile-updated', handleProfileUpdated)
  }, [refresh])

  return (
    <DashboardShellContext.Provider value={{ data, refresh }}>
      {children}
    </DashboardShellContext.Provider>
  )
}

export function useDashboardShell() {
  const context = useContext(DashboardShellContext)
  if (!context) {
    throw new Error('useDashboardShell must be used within DashboardShellProvider')
  }
  return context
}