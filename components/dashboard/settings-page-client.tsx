'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AppearanceSettings } from '@/components/appearance-settings'
import { CompanyProfileSettings } from '@/components/dashboard/company-profile-settings'
import { SettingsPanel } from '@/components/dashboard/settings-panel'
import { StripeConnectSettings } from '@/components/dashboard/stripe-connect-settings'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'

type CompanySettings = {
  name?: string | null
  logo_url?: string | null
  timezone?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
} | null

export function SettingsPageClient() {
  const supabase = createClient()
  const [company, setCompany] = useState<CompanySettings>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>('idle')
  const [profileSaveMessage, setProfileSaveMessage] = useState('')

  const handleProfileSaveStatusChange = useCallback(
    (status: SaveStatus, message?: string) => {
      setProfileSaveStatus(status)
      setProfileSaveMessage(message || '')
    },
    []
  )

  useEffect(() => {
    const fetchCompanySettings = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) {
        setIsLoading(false)
        return
      }

      const { data: companyData } = await supabase
        .from('companies')
        .select(`
          name,
          logo_url,
          timezone,
          business_hours_start,
          business_hours_end,
          address,
          address_street,
          address_unit,
          address_city,
          address_state,
          address_zip
        `)
        .eq('id', profile.company_id)
        .single()

      setCompany(companyData)
      setIsLoading(false)
    }

    fetchCompanySettings()
  }, [supabase])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col gap-4 p-4 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Changes to company profile save automatically. Appearance and billing save on action.
        </p>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-4">
        <SettingsPanel
          title="Appearance"
          description="Light or dark mode for the dashboard, portal, and admin."
          className="lg:col-start-1 lg:row-start-1"
        >
          <AppearanceSettings embedded />
        </SettingsPanel>

        <SettingsPanel
          title="Billing & Payments"
          description="Connect Stripe to enable invoicing and client payments."
          className="lg:col-start-1 lg:row-start-2"
        >
          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground">Loading billing settings...</p>
            }
          >
            <StripeConnectSettings embedded />
          </Suspense>
        </SettingsPanel>

        <SettingsPanel
          title="Company Profile"
          description="Branding, office location, and scheduling defaults."
          className="lg:col-start-2 lg:row-span-2"
          action={
            <SaveStatusBadge status={profileSaveStatus} message={profileSaveMessage} />
          }
        >
          <CompanyProfileSettings
            company={company}
            onSaveStatusChange={handleProfileSaveStatusChange}
          />
        </SettingsPanel>
      </div>
    </div>
  )
}
