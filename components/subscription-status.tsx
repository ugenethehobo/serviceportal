'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react'

interface SubscriptionStatus {
  status: string
  plan?: string | null
  isTrialing: boolean
  trialClientsUsed?: number
  trialClientsLimit?: number
}

export function SubscriptionStatus() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)

  useEffect(() => {
    async function loadStatus() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: company } = await supabase
        .from('companies')
        .select(`
          subscription_status,
          trial_clients_used,
          trial_clients_limit,
          subscriptions ( plan )
        `)
        .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
        .limit(1)
        .single()

      if (company) {
        const sub = company.subscriptions?.[0]
        setStatus({
          status: company.subscription_status || 'unknown',
          plan: sub?.plan,
          isTrialing: company.subscription_status === 'trialing',
          trialClientsUsed: company.trial_clients_used,
          trialClientsLimit: company.trial_clients_limit,
        })
      }
    }
    loadStatus()
  }, [])

  if (!status) return null

  const { status: subStatus, plan, isTrialing, trialClientsUsed, trialClientsLimit } = status

  // Active - don't show anything (clean)
  if (subStatus === 'active') {
    return null
  }

  let content = null
  let bgColor = ''
  let borderColor = ''
  let Icon = AlertTriangle

  if (isTrialing) {
    const used = trialClientsUsed ?? 0
    const limit = trialClientsLimit ?? 3
    const remaining = Math.max(0, limit - used)
    
    Icon = Clock
    bgColor = 'bg-blue-50'
    borderColor = 'border-blue-200'
    
    content = (
      <>
        <strong>Free Trial Active</strong> — {used} of {limit} free clients used.
        {remaining <= 1 && (
          <span className="block mt-1 text-blue-700">
            {remaining === 0 ? 'You have reached your limit.' : `Only ${remaining} free client remaining.`}
          </span>
        )}
      </>
    )
  } else if (subStatus === 'past_due') {
    Icon = AlertTriangle
    bgColor = 'bg-amber-50'
    borderColor = 'border-amber-200'
    content = (
      <>
        <strong>Payment Past Due</strong> — Please update your payment method to avoid service interruption.
      </>
    )
  } else if (subStatus === 'canceled' || subStatus === 'unpaid') {
    Icon = XCircle
    bgColor = 'bg-red-50'
    borderColor = 'border-red-200'
    content = (
      <>
        <strong>Subscription {subStatus === 'canceled' ? 'Canceled' : 'Unpaid'}</strong> — Your access may be limited. Please contact support or resubscribe.
      </>
    )
  } else {
    return null
  }

  return (
    <div className={`border ${borderColor} ${bgColor} p-4 mb-6 flex items-start gap-3 rounded-none`}>
      <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="text-sm">
        {content}
      </div>
    </div>
  )
}
