'use client'

import { useDashboardShell } from '@/components/dashboard/dashboard-shell-context'
import { TrialStatusBanner } from '@/components/dashboard/trial-status-banner'

export function DashboardTrialBanner() {
  const { data } = useDashboardShell()

  if (!data?.subscriptionAccess) return null

  return (
    <TrialStatusBanner
      access={data.subscriptionAccess}
      isAdmin={data.role === 'company_admin'}
    />
  )
}