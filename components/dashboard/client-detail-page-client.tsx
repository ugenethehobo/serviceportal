'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog"
import { CalendarDays, Users, Banknote, MapPin, Pencil } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardTitle, CardHeader, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from "@/components/ui/scroll-area"
import { MainPageCard } from '@/components/ui/main-page-card'
import { MobileListCard } from '@/components/ui/mobile-list-card'
import {
  archiveClientAction,
  createJobAction,
  convertEstimateToJobAction,
  getClientDetailAction,
  restoreClientAction,
  syncScheduleStatusesAction,
  updateClientAction,
} from '@/app/action'
import { SOLO_CREW_NAME } from '@/lib/company-operations'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import { toast } from 'sonner'
import { StructuredAddressForm } from '@/components/dashboard/company-address-form'
import {
  buildStructuredAddressDbFields,
  emptyStructuredAddress,
  getDisplayAddressFromClient,
  normalizeStructuredAddress,
  structuredAddressFromClientRow,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'
import { parseAsCompanyTime } from '@/lib/timezone'
import { getServicePackagesAction } from '@/app/service-package-actions'
import { JobFormFields } from '@/components/dashboard/job-form-fields'
import { ServicePackageTemplatePicker } from '@/components/dashboard/service-package-template-picker'
import { applyServicePackageToJobForm, type ServicePackage } from '@/lib/service-packages'
import { formatForDatetimeLocal } from '@/lib/timezone'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { ClientBillingPanel } from '@/components/dashboard/client-billing-panel'
import { ClientEstimatesPanel } from '@/components/dashboard/client-estimates-panel'
import { ClientDocumentsPanel } from '@/components/dashboard/client-documents-panel'
import { ClientPhotosPanel } from '@/components/dashboard/client-photos-panel'
import { ClientMessagingPanel } from '@/components/dashboard/client-messaging-panel'
import { ClientPortalAccess } from '@/components/dashboard/client-portal-access'
import { StaffActivityCard } from '@/components/dashboard/staff-activity-card'
import { StripeConnectGate } from '@/components/dashboard/stripe-connect-gate'
import { SearchBar } from '@/components/search-bar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { matchesSearch } from '@/lib/search'
import {
  MOBILE_LG_TAB_LIST_CLASS,
  MOBILE_LIST_STACK_CLASS,
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_SCROLL_VIEWPORT_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { useLazyMountedTabs } from '@/hooks/use-lazy-mounted-tabs'
import type { Estimate } from '@/lib/estimates'
import type { ActivityFeedItem } from '@/lib/activity-feed'

type ClientDetailTab =
  | 'jobs'
  | 'estimates'
  | 'billing'
  | 'portal'
  | 'documents'
  | 'photos'
  | 'messaging'

interface Client {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  notes?: string
  status: 'active' | 'archived'
  created_at: string
}

const CLIENT_DETAIL_TABS: ClientDetailTab[] = [
  'jobs',
  'estimates',
  'billing',
  'portal',
  'documents',
  'photos',
  'messaging',
]

function isClientDetailTab(value: string | null): value is ClientDetailTab {
  return Boolean(value && CLIENT_DETAIL_TABS.includes(value as ClientDetailTab))
}

type ClientDetailPageClientProps = {
  clientId: string
  initialClient: Client
  initialSchedules: any[]
  initialIsSoloBusiness: boolean
  initialSoloCrewId: string | null
  initialActivity: ActivityFeedItem[]
  initialTimezone: string
}

export function ClientDetailPageClient({
  clientId,
  initialClient,
  initialSchedules,
  initialIsSoloBusiness,
  initialSoloCrewId,
  initialActivity,
  initialTimezone,
}: ClientDetailPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [client, setClient] = useState<Client | null>(initialClient)
  const [isLoading, setIsLoading] = useState(false)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')
  const [tempAddress, setTempAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [legacyClientAddress, setLegacyClientAddress] = useState<string | null>(null)
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)

  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  const [availableCrews, setAvailableCrews] = useState<any[]>([])
  const [conflictInfo, setConflictInfo] = useState<any>(null)
  const [isSoloBusiness, setIsSoloBusiness] = useState(initialIsSoloBusiness)
  const [soloCrewId, setSoloCrewId] = useState<string | null>(initialSoloCrewId)

  const [showArchived, setShowArchived] = useState(false)
  const [jobSearchQuery, setJobSearchQuery] = useState('')

  const tabFromUrl = searchParams.get('tab')
  const initialTab = isClientDetailTab(tabFromUrl) ? tabFromUrl : 'jobs'
  const [activeTab, setActiveTab] = useState<ClientDetailTab>(initialTab)
  const { mountedTabs, mountTab } = useLazyMountedTabs(activeTab, initialTab)
  const [activity, setActivity] = useState(initialActivity)

  // Keep tab state in sync with the URL only when the query changes (e.g. exit
  // portal preview → ?tab=portal). Do not depend on activeTab here — that would
  // fight local clicks while the old query param is still present.
  useEffect(() => {
    const nextTab = isClientDetailTab(tabFromUrl) ? tabFromUrl : 'jobs'
    setActiveTab(nextTab)
    mountTab(nextTab)
  }, [tabFromUrl, mountTab])

  const handleTabChange = (tab: ClientDetailTab) => {
    setActiveTab(tab)
    mountTab(tab)

    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'jobs') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const query = params.toString()
    router.replace(
      query
        ? `/dashboard/clients/${clientId}?${query}`
        : `/dashboard/clients/${clientId}`,
      { scroll: false }
    )
  }

  const [newJob, setNewJob] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    crewId: '',
    recurrence: 'none',
    price: '',
  })
  const [servicePackages, setServicePackages] = useState<ServicePackage[]>([])
  const [selectedJobTemplateId, setSelectedJobTemplateId] = useState('')
  const [companyTimezone, setCompanyTimezone] = useState('America/Chicago')

  const [schedules, setSchedules] = useState<any[]>(initialSchedules)
  const [convertingEstimate, setConvertingEstimate] = useState<Estimate | null>(null)
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0)
  const [photosRefreshKey, setPhotosRefreshKey] = useState(0)
  const [clientStatusConfirm, setClientStatusConfirm] = useState<'archive' | 'restore' | null>(null)
  const [isClientStatusLoading, setIsClientStatusLoading] = useState(false)

  useEffect(() => {
    const loadJobTemplates = async () => {
      const [packagesResult, profileResult] = await Promise.all([
        getServicePackagesAction({ activeOnly: true }),
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return null
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('id', user.id)
            .single()
          if (!profile?.company_id) return null
          const { data: company } = await supabase
            .from('companies')
            .select('timezone')
            .eq('id', profile.company_id)
            .single()
          return company
        }),
      ])

      if (packagesResult.success) {
        setServicePackages(packagesResult.packages)
      }
      if (profileResult?.timezone) {
        setCompanyTimezone(profileResult.timezone)
      }
    }

    void loadJobTemplates()
  }, [supabase])

  const refreshClientData = async () => {
    const result = await getClientDetailAction(clientId)
    if (result.success) {
      setClient(result.data.client)
      setSchedules(result.data.schedules)
      setIsSoloBusiness(result.data.isSoloBusiness)
      setSoloCrewId(result.data.soloCrewId)
      setActivity(result.data.activity)
    } else {
      console.error('Error refreshing client:', result.error)
    }
    setIsLoading(false)
  }

  // ==================== INLINE EDITING ====================
  const saveField = async (field: string, value: string) => {
    if (!client) return

    const result = await updateClientAction({
      id: client.id,
      name: client.name,
      [field]: value || null,
    })

    if (result.success) {
      setClient({ ...client, [field]: value || undefined })
    } else {
      toast.error('Failed to save changes')
      setTempValue((client as any)[field] || '')
    }
    setEditingField(null)
  }

  const startEditing = (field: string, currentValue: string) => {
    setEditingField(field)
    setTempValue(currentValue || '')
  }

  const handleBlur = (field: string) => {
    if (tempValue !== (client as any)[field]) {
      saveField(field, tempValue)
    } else {
      setEditingField(null)
    }
  }

  const openAddressModal = () => {
    if (!client) return
    const structured = structuredAddressFromClientRow(client)
    setTempAddress(structured.street ? structured : emptyStructuredAddress())
    setLegacyClientAddress(
      structured.street ? null : client.address?.trim() || null
    )
    setAddressErrors({})
    setIsAddressModalOpen(true)
  }

  const closeAddressModal = () => {
    setIsAddressModalOpen(false)
    setAddressErrors({})
    setLegacyClientAddress(null)
  }

  const saveAddress = async () => {
    if (!client) return

    const normalized = normalizeStructuredAddress(tempAddress)
    const validation = validateStructuredAddressIfPresent(normalized)
    if (!validation.valid) {
      setAddressErrors(validation.errors)
      return
    }

    setIsSavingAddress(true)

    const result = await updateClientAction({
      id: client.id,
      name: client.name,
      clientAddress: normalized,
    })

    if (result.success) {
      const addressFields = buildStructuredAddressDbFields(normalized)
      setClient({
        ...client,
        ...addressFields,
        address: addressFields.address || undefined,
      })
      closeAddressModal()
    } else {
      toast.error(result.error || 'Failed to save address')
    }

    setIsSavingAddress(false)
  }

  // ==================== ADD JOB LOGIC ====================
  const refreshAvailableCrews = async (start: string, end: string) => {
    if (!start || !end || !client) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', (await supabase.auth.getUser()).data.user?.id)
      .single()

    if (!profile?.company_id) return

    const { data: crews } = await supabase
      .from('crews')
      .select('id, name')
      .eq('company_id', profile.company_id)

    if (!crews) return []

    const available = []

    for (const crew of crews) {
      const { data: conflicts } = await supabase
        .from('schedules')
        .select('id')
        .eq('crew_id', crew.id)
        .neq('status', 'archived')
        .lte('start_time', end)
        .gte('end_time', start)

      if (!conflicts || conflicts.length === 0) {
        available.push(crew)
      }
    }

    setAvailableCrews(available)
  }

  const handleStartTimeChange = (startTime: string) => {
    const template = servicePackages.find((pkg) => pkg.id === selectedJobTemplateId)
    const nextJob = template
      ? applyServicePackageToJobForm(template, { ...newJob, startTime }, companyTimezone)
      : {
          ...newJob,
          startTime,
          endTime: formatForDatetimeLocal(
            new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString(),
            companyTimezone
          ),
        }

    setNewJob(nextJob)
    refreshAvailableCrews(nextJob.startTime, nextJob.endTime)
    setConflictInfo(null)
  }

  const handleJobTemplateSelect = (packageId: string) => {
    setSelectedJobTemplateId(packageId)
    const template = servicePackages.find((pkg) => pkg.id === packageId)
    if (!template) return
    setNewJob((current) => applyServicePackageToJobForm(template, current, companyTimezone))
    if (newJob.startTime && newJob.endTime) {
      const next = applyServicePackageToJobForm(template, newJob, companyTimezone)
      refreshAvailableCrews(next.startTime, next.endTime)
    }
    setConflictInfo(null)
  }

  const handleEndTimeChange = (endTime: string) => {
    setNewJob(prev => ({ ...prev, endTime }))
    refreshAvailableCrews(newJob.startTime, endTime)
    setConflictInfo(null)
  }

  const handleCrewChange = async (crewId: string) => {
    setNewJob(prev => ({ ...prev, crewId }))
    setConflictInfo(null)

    if (crewId && newJob.startTime && newJob.endTime) {
      const { data: conflicts } = await supabase
        .from('schedules')
        .select('id')
        .eq('crew_id', crewId)
        .neq('status', 'archived')
        .lte('start_time', newJob.endTime)
        .gte('end_time', newJob.startTime)

      if (conflicts && conflicts.length > 0) {
        setConflictInfo({
          message: "This crew has a conflict with the selected time range.",
        })
        setNewJob(prev => ({ ...prev, crewId: '' }))
        refreshAvailableCrews(newJob.startTime, newJob.endTime)
      }
    }
  }

  const handleConvertToJob = (estimate: Estimate) => {
    setConvertingEstimate(estimate)
    setNewJob({
      title: estimate.title,
      description: estimate.description || '',
      startTime: '',
      endTime: '',
      crewId: '',
      recurrence: 'none',
      price: String(estimate.total || 0),
    })
    setConflictInfo(null)
    setIsAddJobModalOpen(true)
  }

  const handleCreateJob = async () => {
    if (!newJob.title || !newJob.startTime || !newJob.endTime) {
      toast.error('Title, start time, and end time are required')
      return
    }

    setIsCreatingJob(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    const { data: company } = await supabase
      .from('companies')
      .select('timezone')
      .eq('id', profile?.company_id)
      .single()

    const companyTimezone = company?.timezone || 'America/Chicago'

    const startTimeUTC = parseAsCompanyTime(newJob.startTime, companyTimezone)
    const endTimeUTC = parseAsCompanyTime(newJob.endTime, companyTimezone)

    const estimateBeingConverted = convertingEstimate
    const resolvedCrewId =
      isSoloBusiness && soloCrewId ? soloCrewId : newJob.crewId || null

    const result = estimateBeingConverted
      ? await convertEstimateToJobAction({
          estimateId: estimateBeingConverted.id,
          clientId,
          companyId: profile?.company_id || '',
          crewId: resolvedCrewId,
          title: newJob.title,
          description: newJob.description,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          recurrence: newJob.recurrence,
        })
      : await createJobAction({
          clientId,
          crewId: resolvedCrewId,
          title: newJob.title,
          description: newJob.description,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          companyId: profile?.company_id || '',
          recurrence: newJob.recurrence,
          price: parseFloat(newJob.price) || 0,
        })

    if (result.success) {
      setNewJob({
        title: '',
        description: '',
        startTime: '',
        endTime: '',
        crewId: '',
        recurrence: 'none',
        price: '',
      })
      setConvertingEstimate(null)
      setSelectedJobTemplateId('')
      setIsAddJobModalOpen(false)
      setConflictInfo(null)
      await refreshClientData()
      setDocumentsRefreshKey((k) => k + 1)
      if (estimateBeingConverted && result.schedule?.id) {
        router.push(`/dashboard/clients/${clientId}/jobs/${result.schedule.id}`)
      }
    } else {
      if (result.suggestedCrews && result.suggestedCrews.length > 0) {
        setAvailableCrews(result.suggestedCrews)
        setConflictInfo({
          message: result.error,
          suggestedCrews: result.suggestedCrews,
        })
      } else {
        toast.error(result.error || 'Failed to create job')
      }
    }

    setIsCreatingJob(false)
  }

  const handleClientStatusChange = async () => {
    if (!client || !clientStatusConfirm) return
    setIsClientStatusLoading(true)

    const result =
      clientStatusConfirm === 'archive'
        ? await archiveClientAction(client.id)
        : await restoreClientAction(client.id)

    if (result.success) {
      toast.success(
        clientStatusConfirm === 'archive' ? 'Client archived' : 'Client restored'
      )
      setClient({ ...client, status: clientStatusConfirm === 'archive' ? 'archived' : 'active' })
      setClientStatusConfirm(null)
    } else {
      toast.error(result.error || 'Action failed')
    }

    setIsClientStatusLoading(false)
  }

  const updateScheduleStatuses = async () => {
    console.log('=== Sync Statuses (Client) ===')

    try {
      const result = await syncScheduleStatusesAction(clientId)

      console.log('Server Action result:', result)

      if (result.success) {
        console.log('Statuses synced:', result.message)
        await refreshClientData()
      } else {
        console.error('Server Action failed:', result.error)
      }
    } catch (error) {
      console.error('Error calling sync action:', error)
    }

    console.log('=== Sync complete ===')
  }

  useEffect(() => {
    if (isSoloBusiness && soloCrewId && isAddJobModalOpen) {
      setNewJob((prev) => ({ ...prev, crewId: soloCrewId }))
    }
  }, [isSoloBusiness, soloCrewId, isAddJobModalOpen])

  useEffect(() => {
    if (!clientId) return

    void updateScheduleStatuses()

    const interval = setInterval(() => {
      void updateScheduleStatuses()
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [clientId])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && clientId) {
        updateScheduleStatuses()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [clientId])

  // ==================== RENDER ====================
  if (isLoading || !client) {
    return (
      <div className="flex h-full min-h-0 flex-col p-6">
        <PageLoadingSkeleton />
      </div>
    )
  }

  const archivedFiltered = showArchived
    ? schedules
    : schedules.filter((schedule) => schedule.status !== 'archived')

  const visibleSchedules = archivedFiltered.filter((schedule) =>
    matchesSearch(
      jobSearchQuery,
      schedule.title,
      schedule.description,
      schedule.status,
      schedule.status?.replace('_', ' '),
      schedule.crew?.name,
      schedule.price > 0 ? String(schedule.price) : undefined
    )
  )

  const displayAddress = client ? getDisplayAddressFromClient(client) : ''

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => handleTabChange(value as ClientDetailTab)}
      className={`flex flex-col h-full min-h-0 p-6 max-md:h-auto max-md:p-4 ${MOBILE_NATURAL_HEIGHT_CLASS}`}
    >
    {/* Header: title/actions on one band, full-width tabs below so they never get crushed */}
    <div className="mb-5 shrink-0 space-y-4 max-md:mb-4 sm:mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard/clients">Clients</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{client.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="mt-2 flex flex-wrap items-center gap-2.5 sm:gap-3">
            <h1 className="text-3xl font-bold tracking-tight max-md:text-2xl">
              {client.name}
            </h1>
            {client.status === 'archived' && (
              <Badge variant="secondary">Archived</Badge>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:flex-col max-md:[&_button]:min-h-11 max-md:[&_button]:w-full">
          {client.status === 'active' ? (
            <Button variant="outline" onClick={() => setClientStatusConfirm('archive')}>
              Archive Client
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setClientStatusConfirm('restore')}>
              Restore Client
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push('/dashboard/clients')}>
            Back to Clients
          </Button>
        </div>
      </div>

      <TabsList className={cn('h-auto w-full justify-start lg:w-fit', MOBILE_LG_TAB_LIST_CLASS)}>
        <TabsTrigger value="jobs" className="px-4 py-1.5 text-sm">
          Jobs
        </TabsTrigger>
        <TabsTrigger value="estimates" className="px-4 py-1.5 text-sm">
          Estimates
        </TabsTrigger>
        <TabsTrigger value="billing" className="px-4 py-1.5 text-sm">
          Billing
        </TabsTrigger>
        <TabsTrigger value="portal" className="px-4 py-1.5 text-sm">
          Client Portal
        </TabsTrigger>
        <TabsTrigger value="documents" className="px-4 py-1.5 text-sm">
          Documents
        </TabsTrigger>
        <TabsTrigger value="photos" className="px-4 py-1.5 text-sm">
          Photos
        </TabsTrigger>
        <TabsTrigger value="messaging" className="px-4 py-1.5 text-sm">
          Messaging
        </TabsTrigger>
      </TabsList>
    </div>

      {/* Slim activity strip — jobs/billing/portal use their own layouts */}
      {activeTab !== 'billing' && activeTab !== 'jobs' && activeTab !== 'portal' ? (
        <StaffActivityCard
          items={activity}
          timezone={initialTimezone}
          variant="client"
          listClassName="max-h-32"
          compact
        />
      ) : null}

      {/* Main Content */}
      <div className={`flex flex-col flex-1 min-h-0 gap-4 ${MOBILE_NATURAL_HEIGHT_CLASS}`}>
        {/* Jobs: list + client details side column (replaces the shared main card) */}
        <TabsContent
          value="jobs"
          className={`mt-0 flex min-h-0 flex-1 flex-col outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        >
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-4',
              'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-stretch lg:gap-4'
            )}
          >
            {/* Jobs list */}
            <MainPageCard className="h-full min-h-0 gap-0 overflow-hidden p-4 sm:p-5 max-md:min-h-[16rem]">
              <div className="mb-4 flex shrink-0 flex-col gap-3 sm:mb-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <SearchBar
                    value={jobSearchQuery}
                    onChange={setJobSearchQuery}
                    placeholder="Search jobs by title, crew, or status..."
                    className="max-w-md flex-1 max-md:max-w-none"
                  />
                  <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-col max-md:items-stretch sm:ml-auto">
                    <div className="flex items-center gap-2">
                      <Switch checked={showArchived} onCheckedChange={setShowArchived} />
                      <span className="text-sm text-muted-foreground">Show archived</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="max-md:w-full"
                      disabled={client.status === 'archived'}
                      onClick={() => {
                        setIsAddJobModalOpen(true)
                        setConflictInfo(null)
                      }}
                    >
                      + Add Job
                    </Button>
                  </div>
                </div>
              </div>

              {visibleSchedules.length > 0 ? (
                <ScrollArea
                  className={`min-h-0 flex-1 ${MOBILE_NATURAL_HEIGHT_CLASS}`}
                  viewportClassName={cn('scroll-fade', MOBILE_SCROLL_VIEWPORT_CLASS)}
                >
                  {/* p-px keeps nested job card rings from clipping */}
                  {/* Desktop: multi-section job rows */}
                  <div className={cn('space-y-3 p-px', MOBILE_TABLE_DESKTOP_ONLY_CLASS)}>
                    {visibleSchedules.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="group flex h-[7.25rem] items-center"
                      >
                        {schedule.recurring_rule_id ? (
                          <div className="mr-2 h-full w-1 shrink-0 rounded-full bg-purple-400" />
                        ) : null}
                        <Card
                          className="flex h-full w-full flex-1 cursor-pointer flex-row overflow-hidden bg-background text-muted-foreground transition-all hover:bg-card hover:text-foreground hover:shadow-md"
                          onClick={() =>
                            router.push(`/dashboard/clients/${clientId}/jobs/${schedule.id}`)
                          }
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <CardHeader className="px-5 py-3">
                              <CardTitle className="flex items-center gap-3 text-base">
                                <span className="truncate">{schedule.title}</span>
                                {schedule.recurring_rule_id ? (
                                  <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                                    RECURRING
                                  </span>
                                ) : null}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 items-center gap-2 px-5 pb-3">
                              <CalendarDays className="size-4 shrink-0" />
                              <div className="min-w-0 text-sm">
                                <div>
                                  {new Date(schedule.start_time).toLocaleDateString([], {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </div>
                                <div className="text-muted-foreground">
                                  {new Date(schedule.start_time).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                  {' – '}
                                  {new Date(schedule.end_time).toLocaleTimeString([], {
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </div>
                              </div>
                            </CardContent>
                          </div>

                          <Separator orientation="vertical" className="h-auto" />

                          <div className="flex min-w-0 flex-1 flex-col">
                            <CardHeader className="px-5 py-3">
                              <CardTitle className="text-base">Status & Crew</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 items-center gap-2 px-5 pb-3">
                              <Users className="size-4 shrink-0" />
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <JobStatusBadge status={schedule.status} />
                                {schedule.crew ? (
                                  <span className="truncate text-sm">
                                    {schedule.crew.name}
                                  </span>
                                ) : null}
                                {schedule.hasCrewConflict ? (
                                  <span className="text-sm font-medium text-red-600">
                                    Conflict
                                  </span>
                                ) : null}
                              </div>
                            </CardContent>
                          </div>

                          <Separator orientation="vertical" className="h-auto" />

                          <div className="flex min-w-0 flex-1 flex-col">
                            <CardHeader className="px-5 py-3">
                              <CardTitle className="text-base">Job Price</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-1 items-center gap-2 px-5 pb-3">
                              <Banknote className="size-4 shrink-0" />
                              {schedule.price > 0 ? (
                                <span className="text-xl font-semibold tracking-tight text-green-600">
                                  ${schedule.price.toFixed(2)}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">No price set</span>
                              )}
                            </CardContent>
                          </div>
                        </Card>
                      </div>
                    ))}
                  </div>

                  {/* Mobile: scannable job cards with clear hierarchy */}
                  <div className={cn('p-px', MOBILE_LIST_STACK_CLASS)}>
                    {visibleSchedules.map((schedule) => (
                      <MobileListCard
                        key={schedule.id}
                        onClick={() =>
                          router.push(`/dashboard/clients/${clientId}/jobs/${schedule.id}`)
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {schedule.recurring_rule_id ? (
                                <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />
                              ) : null}
                              <p className="text-base font-semibold leading-snug">
                                {schedule.title}
                              </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {new Date(schedule.start_time).toLocaleDateString([], {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                              {' · '}
                              {new Date(schedule.start_time).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </p>
                            {schedule.crew ? (
                              <p className="text-sm text-muted-foreground">
                                Crew: {schedule.crew.name}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <JobStatusBadge status={schedule.status} />
                            {schedule.price > 0 ? (
                              <span className="text-base font-semibold tabular-nums text-green-600">
                                ${schedule.price.toFixed(2)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </MobileListCard>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {archivedFiltered.length > 0 && jobSearchQuery.trim()
                    ? 'No jobs match your search.'
                    : 'No jobs scheduled yet for this client.'}
                </div>
              )}
            </MainPageCard>

            {/* Client details column — cards size to content; column scrolls via ScrollArea */}
            <div
              className={cn(
                'flex h-full min-h-0 flex-col overflow-hidden',
                MOBILE_NATURAL_HEIGHT_CLASS
              )}
            >
              <ScrollArea
                className={cn(
                  'h-full min-h-0 w-full flex-1',
                  MOBILE_NATURAL_HEIGHT_CLASS
                )}
                viewportClassName={cn('scroll-fade', MOBILE_SCROLL_VIEWPORT_CLASS)}
              >
                {/* p-px prevents card border/ring clipping at scroll edges */}
                <div className="flex flex-col gap-4 p-px pb-1">
                  <Card className="flex h-52 shrink-0 flex-col gap-0 overflow-hidden p-0 py-0 shadow-sm lg:h-56">
                    <StaffActivityCard
                      items={activity}
                      timezone={initialTimezone}
                      variant="client"
                      embedded
                      compact
                      listClassName="h-full min-h-0 flex-1"
                    />
                  </Card>

                  <Card className="flex shrink-0 flex-col gap-4 p-4 shadow-sm sm:p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold">Contact</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={openAddressModal}
                      >
                        <Pencil className="mr-1 size-3.5" />
                        Address
                      </Button>
                    </div>
                    <div className="space-y-4">
                      {[
                        { label: 'Name', field: 'name', value: client.name },
                        { label: 'Email', field: 'email', value: client.email },
                        { label: 'Phone', field: 'phone', value: client.phone },
                      ].map(({ label, field, value }) => (
                        <div key={field} className="min-w-0">
                          <div className="text-sm text-muted-foreground">{label}</div>
                          {editingField === field ? (
                            <Input
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value)}
                              onBlur={() => handleBlur(field)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleBlur(field)
                                if (e.key === 'Escape') setEditingField(null)
                              }}
                              autoFocus
                              className="mt-1.5"
                            />
                          ) : (
                            <div
                              onClick={() =>
                                startEditing(field, (client as any)[field] || '')
                              }
                              className="-mx-1 cursor-pointer break-words rounded-md px-1.5 py-1.5 text-sm font-medium hover:bg-muted/50"
                            >
                              {value || (
                                <span className="italic text-muted-foreground">
                                  Click to add
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="min-w-0">
                        <div className="text-sm text-muted-foreground">Address</div>
                        <button
                          type="button"
                          onClick={openAddressModal}
                          className="-mx-1 mt-1 w-full rounded-md px-1.5 py-2 text-left text-sm hover:bg-muted/50"
                        >
                          {displayAddress ? (
                            <span className="flex items-start gap-2 font-medium leading-snug break-words">
                              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                              <span className="min-w-0">{displayAddress}</span>
                            </span>
                          ) : (
                            <span className="italic text-muted-foreground">
                              No address — click to add
                            </span>
                          )}
                        </button>
                      </div>
                    </div>
                  </Card>

                  <Card className="flex shrink-0 flex-col gap-3 p-4 shadow-sm sm:p-5">
                    <h3 className="text-base font-semibold">Notes</h3>
                    <Textarea
                      value={client.notes || ''}
                      onChange={async (e) => {
                        const newNotes = e.target.value
                        setClient({ ...client, notes: newNotes })
                        clearTimeout((window as any).notesTimeout)
                        ;(window as any).notesTimeout = setTimeout(async () => {
                          await updateClientAction({
                            id: client.id,
                            name: client.name,
                            notes: newNotes,
                          })
                        }, 800)
                      }}
                      className="min-h-[9rem] resize-y text-sm leading-relaxed"
                      placeholder="Internal notes about this client…"
                    />
                  </Card>

                </div>
              </ScrollArea>
            </div>
          </div>
        </TabsContent>

        {/* Billing replaces the main card with its own left/right surfaces */}
        <TabsContent
          value="billing"
          className={`flex flex-col flex-1 min-h-0 mt-0 outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        >
          {mountedTabs.has('billing') ? (
            <StripeConnectGate showAlert={false}>
              <ClientBillingPanel
                clientId={clientId}
                activity={activity}
                timezone={initialTimezone}
              />
            </StripeConnectGate>
          ) : null}
        </TabsContent>

        {/* Client portal management (company admin) */}
        <TabsContent
          value="portal"
          className={`mt-0 flex min-h-0 flex-1 flex-col outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        >
          {mountedTabs.has('portal') ? (
            <ClientPortalAccess
              clientId={clientId}
              clientEmail={client.email}
              timezone={initialTimezone}
            />
          ) : null}
        </TabsContent>

        {/* Other tabs share one main card (hidden on jobs / billing / portal) */}
        <Card
          className={cn(
            'flex min-h-0 flex-1 flex-col p-6 max-md:flex-none max-md:p-4',
            MOBILE_NATURAL_HEIGHT_CLASS,
            (activeTab === 'billing' ||
              activeTab === 'jobs' ||
              activeTab === 'portal') &&
              'hidden'
          )}
        >
          <TabsContent
            value="estimates"
            className={`flex flex-col flex-1 min-h-0 mt-0 outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
          >
            {mountedTabs.has('estimates') ? (
              <ClientEstimatesPanel
                clientId={clientId}
                onConvertToJob={handleConvertToJob}
                onDocumentsChange={() => setDocumentsRefreshKey((k) => k + 1)}
              />
            ) : null}
          </TabsContent>

          <TabsContent
            value="documents"
            className={`flex flex-col flex-1 min-h-0 mt-0 outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
          >
            {mountedTabs.has('documents') ? (
              <ClientDocumentsPanel clientId={clientId} refreshKey={documentsRefreshKey} />
            ) : null}
          </TabsContent>

          <TabsContent
            value="photos"
            className={`flex flex-col flex-1 min-h-0 mt-0 outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
          >
            {mountedTabs.has('photos') ? (
              <ClientPhotosPanel clientId={clientId} refreshKey={photosRefreshKey} />
            ) : null}
          </TabsContent>

          <TabsContent
            value="messaging"
            className={`flex flex-col flex-1 min-h-0 mt-0 outline-none ${MOBILE_NATURAL_HEIGHT_CLASS}`}
          >
            {mountedTabs.has('messaging') ? (
              <ClientMessagingPanel clientId={clientId} clientName={client.name} />
            ) : null}
          </TabsContent>
        </Card>
      </div>

      {/* Edit Address Modal */}
      <Dialog
        open={isAddressModalOpen}
        onOpenChange={(open) => {
          if (!open) closeAddressModal()
          else setIsAddressModalOpen(true)
        }}
      >
        <DialogContent className="!max-w-lg max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
            <DialogTitle>Client Address</DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
          <div className="space-y-4 px-6 py-2 pb-6">
            {legacyClientAddress && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                Saved address from the previous format:{' '}
                <span className="font-medium">{legacyClientAddress}</span>.
                Re-enter it using the fields below.
              </div>
            )}
            <StructuredAddressForm
              value={tempAddress}
              onChange={(value) => {
                setTempAddress(value)
                if (Object.keys(addressErrors).length > 0) {
                  setAddressErrors({})
                }
              }}
              errors={addressErrors}
              idPrefix="client"
              required={false}
            />
          </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
            <Button variant="outline" onClick={closeAddressModal} disabled={isSavingAddress}>
              Cancel
            </Button>
            <Button onClick={saveAddress} disabled={isSavingAddress}>
              {isSavingAddress ? 'Saving...' : 'Save Address'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Job Modal */}
      <Dialog
        open={isAddJobModalOpen}
        onOpenChange={(open) => {
          setIsAddJobModalOpen(open)
          if (!open) {
            setConvertingEstimate(null)
            setSelectedJobTemplateId('')
          }
        }}
      >
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {convertingEstimate ? 'Convert Estimate to Job' : 'Add New Job'}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-4">
            {!convertingEstimate ? (
              <ServicePackageTemplatePicker
                packages={servicePackages}
                value={selectedJobTemplateId}
                onSelect={handleJobTemplateSelect}
              />
            ) : null}
            <JobFormFields
              values={newJob}
              onChange={setNewJob}
              availableCrews={availableCrews}
              conflictInfo={conflictInfo}
              onStartTimeChange={handleStartTimeChange}
              onEndTimeChange={handleEndTimeChange}
              onCrewChange={handleCrewChange}
              disabledFields={convertingEstimate ? { price: true } : undefined}
              isSoloBusiness={isSoloBusiness}
              soloCrewName={SOLO_CREW_NAME}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsAddJobModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateJob} disabled={isCreatingJob}>
              {isCreatingJob
                ? 'Creating...'
                : convertingEstimate
                  ? 'Create Job from Estimate'
                  : 'Create Job'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!clientStatusConfirm} onOpenChange={(open) => !open && setClientStatusConfirm(null)}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {clientStatusConfirm === 'archive' ? 'Archive Client' : 'Restore Client'}
            </DialogTitle>
            <DialogDescription>
              {clientStatusConfirm === 'archive'
                ? 'Archived clients are hidden from the default clients list. Existing jobs and billing history are kept.'
                : 'This client will return to the active clients list and can receive new jobs.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClientStatusConfirm(null)}>
              Back
            </Button>
            <Button onClick={handleClientStatusChange} disabled={isClientStatusLoading}>
              {isClientStatusLoading
                ? 'Processing...'
                : clientStatusConfirm === 'archive'
                  ? 'Archive Client'
                  : 'Restore Client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}
