'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { StripeConnectSettings } from '@/components/dashboard/stripe-connect-settings'

export default function SettingsPage() {
  const supabase = createClient()
  const [timezone, setTimezone] = useState('America/Chicago')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)

  const timezones = Intl.supportedValuesOf('timeZone')

  useEffect(() => {
    const fetchCompanyTimezone = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get user's company
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (profile?.company_id) {
        setCompanyId(profile.company_id)

        // Get company timezone
        const { data: company } = await supabase
          .from('companies')
          .select('timezone')
          .eq('id', profile.company_id)
          .single()

        if (company?.timezone) {
          setTimezone(company.timezone)
        }
      }
    }

    fetchCompanyTimezone()
  }, [])

  const handleSave = async () => {
    if (!companyId) return

    setIsSaving(true)

    const { error } = await supabase
      .from('companies')
      .update({ timezone })
      .eq('id', companyId)

    if (error) {
      setMessage('Failed to save timezone')
    } else {
      setMessage('Timezone saved successfully!')
      setTimeout(() => setMessage(''), 2000)
    }

    setIsSaving(false)
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <Suspense fallback={<Card className="p-6"><p className="text-sm text-muted-foreground">Loading billing settings...</p></Card>}>
        <StripeConnectSettings />
      </Suspense>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label>Company Timezone</Label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-background mt-1"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground mt-1">
              This timezone will be used for all scheduling and automatic job status updates.
            </p>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Timezone'}
          </Button>

          {message && <p className="text-sm text-green-600">{message}</p>}
        </div>
      </Card>
    </div>
  )
}
