'use client'

import { useEffect, useState } from 'react'
import { getCompanySubscriptionAccessAction } from '@/app/action'
import { TrialStatusBanner } from '@/components/dashboard/trial-status-banner'
import type { CompanySubscriptionAccess } from '@/lib/platform-trial'

export function DashboardTrialBanner() {
  const [access, setAccess] = useState<CompanySubscriptionAccess | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void (async () => {
      const result = await getCompanySubscriptionAccessAction()
      if (result.success) {
        setAccess(result.access)
        setIsAdmin(result.role === 'company_admin')
      }
      setLoaded(true)
    })()
  }, [])

  if (!loaded || !access) return null

  return <TrialStatusBanner access={access} isAdmin={isAdmin} />
}