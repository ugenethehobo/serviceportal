'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SubscriptionStatusPill() {
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: company } = await supabase
        .from('companies')
        .select('subscription_status')
        .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
        .limit(1)
        .single()

      if (company) {
        setStatus(company.subscription_status)
      }
    }
    load()
  }, [])

  if (!status || status === 'active') return null

  const color = status === 'trialing' ? 'bg-blue-100 text-blue-800' : 
                status === 'past_due' ? 'bg-amber-100 text-amber-800' : 
                'bg-red-100 text-red-800'

  return (
    <div className={`text-[10px] px-2 py-0.5 rounded-none font-medium ${color}`}>
      {status.toUpperCase()}
    </div>
  )
}
