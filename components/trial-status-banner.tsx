'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle } from 'lucide-react'

/** Check if current user is an owner via server action (safe for client) */
async function isCurrentUserOwner(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/is-owner', { method: 'GET' })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.isOwner
  } catch {
    return false
  }
}

interface TrialStatus {
  isTrialing: boolean
  clientsUsed: number
  clientsLimit: number
  remaining: number
}

export function TrialStatusBanner() {
  const [status, setStatus] = useState<TrialStatus | null>(null)

  useEffect(() => {
    async function loadTrialStatus() {
      // Don't show trial banner for owners
      const isOwner = await isCurrentUserOwner()
      if (isOwner) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: company } = await supabase
        .from('companies')
        .select('subscription_status, trial_clients_used, trial_clients_limit')
        .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
        .limit(1)
        .single()

      if (company && company.subscription_status === 'trialing') {
        const used = company.trial_clients_used ?? 0
        const limit = company.trial_clients_limit ?? 3

        setStatus({
          isTrialing: true,
          clientsUsed: used,
          clientsLimit: limit,
          remaining: Math.max(0, limit - used),
        })
      }
    }

    loadTrialStatus()
  }, [])

  if (!status || !status.isTrialing) return null

  const isLow = status.remaining <= 1

  return (
    <div className={`border p-3 mb-4 flex items-start gap-3 rounded-none ${
      isLow ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'
    }`}>
      <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isLow ? 'text-amber-600' : 'text-blue-600'}`} />
      <div className="text-sm">
        <strong>Free Trial Active</strong> — You have used <strong>{status.clientsUsed}</strong> of <strong>{status.clientsLimit}</strong> free clients.
        {status.remaining === 0 && (
          <span className="block mt-1 text-amber-700 font-medium">
            You have reached your free client limit. Upgrade to continue adding clients.
          </span>
        )}
        {status.remaining > 0 && status.remaining <= 1 && (
          <span className="block mt-1">You have <strong>{status.remaining}</strong> free client remaining.</span>
        )}
      </div>
    </div>
  )
}
