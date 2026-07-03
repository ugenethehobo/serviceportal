'use client'

import { Suspense, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { AppearanceSettings } from '@/components/appearance-settings'
import { CompanyAddressForm } from '@/components/dashboard/company-address-form'
import { StripeConnectSettings } from '@/components/dashboard/stripe-connect-settings'
import { updateCompanySettingsAction } from '@/app/action'
import {
  emptyStructuredAddress,
  formatAddressForDisplay,
  normalizeStructuredAddress,
  structuredAddressFromCompanyRow,
  validateStructuredAddress,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'
import {
  DEFAULT_BUSINESS_HOURS,
  isValidBusinessHoursRange,
  normalizeBusinessHours,
  type BusinessHours,
} from '@/lib/business-hours'

export default function SettingsPage() {
  const supabase = createClient()
  const [timezone, setTimezone] = useState('America/Chicago')
  const [companyAddress, setCompanyAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null)
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const timezones = Intl.supportedValuesOf('timeZone')

  useEffect(() => {
    const fetchCompanySettings = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (!profile?.company_id) return

      const { data: company } = await supabase
        .from('companies')
        .select(`
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

      if (company?.timezone) {
        setTimezone(company.timezone)
      }

      const structured = structuredAddressFromCompanyRow(company)
      if (structured.street) {
        setCompanyAddress(structured)
        setLegacyAddress(null)
      } else if (company?.address) {
        setLegacyAddress(company.address)
      }

      setBusinessHours(
        normalizeBusinessHours(company?.business_hours_start, company?.business_hours_end)
      )
    }

    fetchCompanySettings()
  }, [supabase])

  const handleSave = async () => {
    setMessage('')
    setError('')

    const normalizedAddress = normalizeStructuredAddress(companyAddress)
    const addressValidation = validateStructuredAddress(normalizedAddress)

    if (!addressValidation.valid) {
      setAddressErrors(addressValidation.errors)
      setError('Please fix the company address fields before saving.')
      return
    }

    setAddressErrors({})

    if (!isValidBusinessHoursRange(businessHours)) {
      setError('Business hours end must be after the start time.')
      return
    }

    setIsSaving(true)

    const result = await updateCompanySettingsAction({
      timezone,
      businessHours,
      companyAddress: normalizedAddress,
    })

    if (!result.success) {
      setError(result.error || 'Failed to save settings')
    } else {
      setLegacyAddress(null)
      setCompanyAddress(normalizedAddress)
      if (result.mapReady) {
        setMessage('Settings saved. Your company address is ready for the dashboard map.')
      } else {
        setMessage('Settings saved.')
        setError(
          result.mapWarning ||
            'Address saved, but it could not be verified for the map. Check street name and ZIP code.'
        )
      }
      setTimeout(() => {
        setMessage('')
        if (result.mapReady) setError('')
      }, 5000)
    }

    setIsSaving(false)
  }

  const previewAddress = formatAddressForDisplay(normalizeStructuredAddress(companyAddress))

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Settings</h1>

      <AppearanceSettings />

      <Suspense fallback={<Card className="p-6"><p className="text-sm text-muted-foreground">Loading billing settings...</p></Card>}>
        <StripeConnectSettings />
      </Suspense>

      <Card className="p-6">
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Company Profile</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your office address is compiled into a map-friendly format for the dashboard.
            </p>
          </div>

          {legacyAddress && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
              You have a saved address from the previous format: <span className="font-medium">{legacyAddress}</span>.
              Re-enter it below using the structured fields and save again.
            </div>
          )}

          <CompanyAddressForm
            value={companyAddress}
            onChange={(value) => {
              setCompanyAddress(value)
              if (Object.keys(addressErrors).length > 0) {
                setAddressErrors({})
              }
            }}
            errors={addressErrors}
            disabled={isSaving}
          />

          {previewAddress.replace(/,\s*/g, '').length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-muted-foreground">Map preview</p>
              <p className="text-sm mt-0.5">{previewAddress}</p>
            </div>
          )}

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
              Used for scheduling, automatic job status updates, and the dashboard timeline.
            </p>
          </div>

          <div>
            <Label>Business Hours</Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              The dashboard jobs timeline scales to this window. Default is 8:00 AM to 5:00 PM.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Start</Label>
                <Input
                  type="time"
                  value={businessHours.start}
                  onChange={(e) =>
                    setBusinessHours((current) => ({ ...current, start: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End</Label>
                <Input
                  type="time"
                  value={businessHours.end}
                  onChange={(e) =>
                    setBusinessHours((current) => ({ ...current, end: e.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>

          {message && <p className="text-sm text-green-600">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </Card>
    </div>
  )
}