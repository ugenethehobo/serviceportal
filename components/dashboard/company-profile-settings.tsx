'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, Clock, MapPin, User } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { updateCompanySoloModeAction } from '@/app/action'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { CompanyAddressForm } from '@/components/dashboard/company-address-form'
import { CompanyLogoUpload } from '@/components/dashboard/company-logo-upload'

import type { SaveStatus } from '@/components/dashboard/save-status-badge'
import { updateCompanySettingsAction } from '@/app/action'
import { dispatchCompanyBrandingUpdate } from '@/lib/company-branding'
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

type CompanyRow = {
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
  is_solo_business?: boolean | null
} | null

interface CompanyProfileSettingsProps {
  company: CompanyRow
  onSaveStatusChange?: (status: SaveStatus, message?: string) => void
}

type ProfileSnapshot = {
  companyName: string
  companyAddress: StructuredAddress
  timezone: string
  businessHours: BusinessHours
}

function serializeSnapshot(snapshot: ProfileSnapshot) {
  return JSON.stringify({
    companyName: snapshot.companyName.trim(),
    companyAddress: normalizeStructuredAddress(snapshot.companyAddress),
    timezone: snapshot.timezone,
    businessHours: snapshot.businessHours,
  })
}

function SettingsSubsection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card/50 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function CompanyProfileSettings({
  company,
  onSaveStatusChange,
}: CompanyProfileSettingsProps) {
  const [companyName, setCompanyName] = useState('')
  const [logoRef, setLogoRef] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('America/Chicago')
  const [companyAddress, setCompanyAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [legacyAddress, setLegacyAddress] = useState<string | null>(null)
  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS)
  const [isSoloBusiness, setIsSoloBusiness] = useState(false)
  const [isSavingSoloMode, setIsSavingSoloMode] = useState(false)
  const isReadyRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedSnapshotRef = useRef('')
  const isSavingRef = useRef(false)
  const hydrationKeyRef = useRef('')

  const timezones = Intl.supportedValuesOf('timeZone')

  const updateSaveStatus = useCallback(
    (status: SaveStatus, message = '') => {
      onSaveStatusChange?.(status, message)
    },
    [onSaveStatusChange]
  )

  useEffect(() => {
    if (!company) return

    const hydrationKey = [
      company.name,
      company.logo_url,
      company.timezone,
      company.business_hours_start,
      company.business_hours_end,
      company.address_street,
      company.address_unit,
      company.address_city,
      company.address_state,
      company.address_zip,
      company.address,
      company.is_solo_business,
    ].join('|')

    if (hydrationKeyRef.current === hydrationKey) return
    hydrationKeyRef.current = hydrationKey

    const structured = structuredAddressFromCompanyRow(company)
    const nextSnapshot: ProfileSnapshot = {
      companyName: company.name || '',
      companyAddress: structured.street ? structured : emptyStructuredAddress(),
      timezone: company.timezone || 'America/Chicago',
      businessHours: normalizeBusinessHours(
        company.business_hours_start,
        company.business_hours_end
      ),
    }

    setCompanyName(nextSnapshot.companyName)
    setLogoRef(company.logo_url ?? null)
    setTimezone(nextSnapshot.timezone)
    setCompanyAddress(nextSnapshot.companyAddress)
    setBusinessHours(nextSnapshot.businessHours)
    setLegacyAddress(structured.street ? null : company.address?.trim() || null)
    setIsSoloBusiness(Boolean(company.is_solo_business))
    setAddressErrors({})

    savedSnapshotRef.current = serializeSnapshot(nextSnapshot)
    isReadyRef.current = true
    updateSaveStatus('idle')
  }, [company, updateSaveStatus])

  const performSave = useCallback(async () => {
    if (!isReadyRef.current || isSavingRef.current) return

    const snapshot: ProfileSnapshot = {
      companyName,
      companyAddress,
      timezone,
      businessHours,
    }

    const serialized = serializeSnapshot(snapshot)
    if (serialized === savedSnapshotRef.current) return

    if (!companyName.trim()) {
      updateSaveStatus('error', 'Company name is required')
      return
    }

    const normalizedAddress = normalizeStructuredAddress(companyAddress)
    const addressValidation = validateStructuredAddress(normalizedAddress)
    if (!addressValidation.valid) {
      setAddressErrors(addressValidation.errors)
      updateSaveStatus('error', 'Complete the office address to save')
      return
    }

    setAddressErrors({})

    if (!isValidBusinessHoursRange(businessHours)) {
      updateSaveStatus('error', 'Business hours end must be after start')
      return
    }

    isSavingRef.current = true
    updateSaveStatus('saving')

    const result = await updateCompanySettingsAction({
      companyName: companyName.trim(),
      timezone,
      businessHours,
      companyAddress: normalizedAddress,
    })

    isSavingRef.current = false

    if (!result.success) {
      updateSaveStatus('error', result.error || 'Failed to save')
      return
    }

    setLegacyAddress(null)
    setCompanyAddress(normalizedAddress)
    savedSnapshotRef.current = serializeSnapshot({
      companyName: companyName.trim(),
      companyAddress: normalizedAddress,
      timezone,
      businessHours,
    })

    dispatchCompanyBrandingUpdate({
      name: companyName.trim(),
      logo_url: logoRef,
    })

    if (result.mapReady) {
      updateSaveStatus('saved')
    } else {
      updateSaveStatus(
        'saved',
        result.mapWarning || 'Saved — address could not be verified for maps'
      )
    }

    setTimeout(() => {
      updateSaveStatus('idle')
    }, 3000)
  }, [
    businessHours,
    companyAddress,
    companyName,
    logoRef,
    timezone,
    updateSaveStatus,
  ])

  useEffect(() => {
    if (!isReadyRef.current) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void performSave()
    }, 900)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [companyName, companyAddress, timezone, businessHours, performSave])

  const previewAddress = formatAddressForDisplay(normalizeStructuredAddress(companyAddress))
  const hasAddressPreview = previewAddress.replace(/,\s*/g, '').length > 0

  const handleSoloModeChange = async (checked: boolean) => {
    const previous = isSoloBusiness
    setIsSoloBusiness(checked)
    setIsSavingSoloMode(true)

    const result = await updateCompanySoloModeAction(checked)
    setIsSavingSoloMode(false)

    if (!result.success) {
      setIsSoloBusiness(previous)
      toast.error(result.error || 'Failed to update business mode')
      return
    }

    toast.success(
      checked
        ? 'Solo business mode enabled'
        : 'Team business mode enabled — you can now manage multiple crews'
    )
    window.dispatchEvent(new Event('dashboard-profile-updated'))
  }

  return (
    <div className="space-y-4">
      <SettingsSubsection
        icon={Building2}
        title="Branding"
        description="Your logo and company name appear in the sidebar."
      >
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-start">
          <CompanyLogoUpload
            companyName={companyName || 'Company'}
            logoRef={logoRef}
            onLogoChange={(ref) => {
              setLogoRef(ref)
            }}
            compact
          />
          <div>
            <Label htmlFor="company-name">Company name</Label>
            <Input
              id="company-name"
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              placeholder="Acme Services LLC"
              className="mt-1"
            />
          </div>
        </div>
      </SettingsSubsection>

      <SettingsSubsection
        icon={MapPin}
        title="Office address"
        description="Used for maps, route planning, and geocoding job sites from your depot."
      >
        {legacyAddress && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
            Previous address on file: <span className="font-medium">{legacyAddress}</span>.
            Enter it in the fields below — changes save automatically.
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
        />

        {hasAddressPreview && (
          <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Formatted for maps
            </p>
            <p className="text-sm mt-1">{previewAddress}</p>
          </div>
        )}
      </SettingsSubsection>

      <SettingsSubsection
        icon={Clock}
        title="Scheduling"
        description="Timezone and business hours control job timelines and automatic status updates."
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="company-timezone">Timezone</Label>
            <select
              id="company-timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-background mt-1 text-sm"
            >
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <Separator />

          <div>
            <Label>Business hours</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Dashboard timeline window · default 8:00 AM – 5:00 PM
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="hours-start" className="text-xs text-muted-foreground">
                  Opens
                </Label>
                <Input
                  id="hours-start"
                  type="time"
                  value={businessHours.start}
                  onChange={(event) =>
                    setBusinessHours((current) => ({ ...current, start: event.target.value }))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hours-end" className="text-xs text-muted-foreground">
                  Closes
                </Label>
                <Input
                  id="hours-end"
                  type="time"
                  value={businessHours.end}
                  onChange={(event) =>
                    setBusinessHours((current) => ({ ...current, end: event.target.value }))
                  }
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        </div>
      </SettingsSubsection>

      <SettingsSubsection
        icon={User}
        title="Business mode"
        description="Choose how crew scheduling works for your company."
      >
        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Solo business</p>
            <p className="text-xs text-muted-foreground mt-1">
              You work alone or don&apos;t need multiple crews. Jobs assign to you automatically,
              and crew management is simplified across the dashboard.
            </p>
          </div>
          <Switch
            checked={isSoloBusiness}
            onCheckedChange={(checked) => void handleSoloModeChange(Boolean(checked))}
            disabled={isSavingSoloMode}
            aria-label="Solo business mode"
          />
        </div>
      </SettingsSubsection>
    </div>
  )
}