'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Fragment } from 'react'
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
import { CalendarDays, Users, Banknote, MapPin, Pencil } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardTitle, CardDescription, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from "@/components/ui/scroll-area"
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
import { StripeConnectGate } from '@/components/dashboard/stripe-connect-gate'
import { SearchBar } from '@/components/search-bar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { matchesSearch } from '@/lib/search'
import type { Estimate } from '@/lib/estimates'

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

type ClientDetailPageClientProps = {
  clientId: string
  initialClient: Client
  initialSchedules: any[]
  initialIsSoloBusiness: boolean
  initialSoloCrewId: string | null
}

export function ClientDetailPageClient({
  clientId,
  initialClient,
  initialSchedules,
  initialIsSoloBusiness,
  initialSoloCrewId,
}: ClientDetailPageClientProps) {
  const router = useRouter()
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

  const [activeTab, setActiveTab] = useState<
    'jobs' | 'estimates' | 'billing' | 'documents' | 'photos' | 'messaging'
    >('jobs')

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
      onValueChange={(value) =>
        setActiveTab(value as 'jobs' | 'estimates' | 'billing' | 'documents' | 'photos' | 'messaging')
      }
      className="flex flex-col h-full min-h-0 p-6 max-md:p-4"
    >
    {/* Header */}
    <div className="flex items-center justify-between mb-6 shrink-0 max-md:mb-4 max-md:flex-col max-md:items-stretch max-md:gap-4">
      {/* Left side: Breadcrumbs + Client Name */}
      <div>
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
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-3xl font-bold tracking-tight max-md:text-2xl">{client.name}</h1>
          {client.status === 'archived' && (
            <Badge variant="secondary">Archived</Badge>
          )}
        </div>
      </div>

      {/* Center: Tab Navigation */}
      <TabsList className="h-auto max-md:w-full max-md:justify-start max-md:overflow-x-auto">
        <TabsTrigger value="jobs" className="px-4 py-1.5 text-sm">
          Jobs
        </TabsTrigger>
        <TabsTrigger value="estimates" className="px-4 py-1.5 text-sm">
          Estimates
        </TabsTrigger>
        <TabsTrigger value="billing" className="px-4 py-1.5 text-sm">
          Billing
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

      {/* Right side: status actions */}
      <div className="flex items-center gap-2 max-md:w-full max-md:flex-col max-md:[&_button]:w-full max-md:[&_button]:min-h-11">
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

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-h-0 gap-6">
        {/* Schedules */}
        <Card className="flex-[7] flex flex-col p-6 min-h-0 max-md:flex-none max-md:p-4">
          {/* Tab Content Area - Full card is now used for the active page */}

          <TabsContent value="jobs" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <>
              {/* Header row for Jobs tab */}
              <div className="flex flex-col gap-3 mb-4 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <SearchBar
                    value={jobSearchQuery}
                    onChange={setJobSearchQuery}
                    placeholder="Search jobs by title, crew, or status..."
                    className="flex-1 max-w-md"
                  />
                  <div className="flex items-center gap-3 sm:ml-auto">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={showArchived}
                        onCheckedChange={setShowArchived}
                      />
                      <span className="text-sm text-muted-foreground">Show archived</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
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

              {/* Jobs List */}
              {visibleSchedules.length > 0 ? (
                <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
                  <div className="space-y-4">
                  {visibleSchedules.map((schedule, index) => (
                    <Fragment key={schedule.id}>
                      {/* Job Card Row */}
                      <div className="h-32 flex items-center mx-1 my-3 group max-md:h-auto max-md:my-2">
                        {/* Your existing left accent bar */}
                        <div className="h-full flex">
                          {schedule.recurring_rule_id && (
                            <div className="w-1 mr-2 rounded-full h-full bg-purple-400" />
                          )}
                        </div>

                        <Card
                          className="flex flex-row flex-1 w-full h-full overflow-hidden hover:shadow-md transition-all bg-background hover:bg-card text-muted-foreground hover:text-foreground cursor-pointer max-md:h-auto max-md:flex-col"
                          onClick={() => router.push(`/dashboard/clients/${clientId}/jobs/${schedule.id}`)}
                        >

                          {/* SECTION 1: Title */}
                          <div className="flex-1 flex flex-col min-w-0 max-md:w-full">
                            <CardHeader className="px-6 max-md:px-4 max-md:py-3">
                              <CardTitle className="flex items-center">
                                <div>{schedule.title}</div>
                                <div className="ml-4">
                                  {schedule.recurring_rule_id && (
                                    <div className="text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-700 shrink-0">
                                      RECURRING
                                    </div>
                                  )}
                                </div>
                              </CardTitle>
                            </CardHeader>

                            <CardContent className="flex items-center flex-1 px-6">
                            <div className="pr-2">
                               <CalendarDays />
                             </div>
                             <div className="flex flex-col">
                               <div className="text-muted-foreground min-w-[100px]">
                                 {new Date(schedule.start_time).toLocaleDateString([], {
                                   month: 'short', day: 'numeric'
                                 })}
                               </div>
                               <div className="text-muted-foreground min-w-[100px]">
                                 {new Date(schedule.start_time).toLocaleTimeString([], {
                                   hour: 'numeric', minute: '2-digit'
                                 })}
                                 {' - '}
                                 {new Date(schedule.end_time).toLocaleTimeString([], {
                                   hour: 'numeric', minute: '2-digit'
                                 })}
                               </div>
                             </div>
                            </CardContent>
                          </div>

                          {/* Vertical Separator */}
                          <Separator orientation="vertical" className="h-auto max-md:hidden" />

                          {/* SECTION 2: Status & Crew */}
                          <div className="flex-1 flex flex-col min-w-0 max-md:w-full max-md:border-t max-md:pt-2">
                            <CardHeader className="px-6 max-md:px-4 max-md:py-3">
                              <CardTitle>Status & Crew</CardTitle>
                            </CardHeader>

                            <CardContent className="flex-1 px-6 flex items-center gap-2">
                              <Users className="shrink-0" />
                              <div className="flex items-center gap-2 flex-wrap">
                                <JobStatusBadge status={schedule.status} />
                                {schedule.crew && (
                                  <span className="text-sm">Assigned to {schedule.crew.name}</span>
                                )}
                              </div>
                            </CardContent>

                            <CardFooter className="px-6">
                              {schedule.hasCrewConflict && (
                                <div className="text-red-600 font-medium">Conflict</div>
                              )}
                            </CardFooter>
                          </div>

                          {/* Vertical Separator */}
                          <Separator orientation="vertical" className="h-auto max-md:hidden" />

                          {/* SECTION 3: Price */}
                          <div className="flex-1 flex flex-col min-w-0 max-md:w-full max-md:border-t max-md:pt-2">
                            <CardHeader className="px-6 max-md:px-4 max-md:py-3">
                              <CardTitle>Job Price</CardTitle>
                            </CardHeader>

                            <CardContent className="flex-1 px-6 flex items-center">
                              <Banknote className="mr-2" />
                              <div>
                                {schedule.price > 0 ? (
                                  <div className="text-2xl font-semibold text-green-600 tracking-tight">
                                    ${schedule.price.toFixed(2)}
                                  </div>
                                ) : (
                                  <div className="text-sm text-muted-foreground">No price set</div>
                                )}
                              </div>
                            </CardContent>

                            <CardFooter className="px-6" />
                          </div>
                        </Card>

                      </div>


                    </Fragment>
                  ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-muted-foreground">
                    {archivedFiltered.length > 0 && jobSearchQuery.trim()
                      ? 'No jobs match your search.'
                      : 'No jobs scheduled yet for this client.'}
                  </p>
                </div>
              )}
            </>
          </TabsContent>

          <TabsContent value="estimates" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <ClientEstimatesPanel
              clientId={clientId}
              onConvertToJob={handleConvertToJob}
              onDocumentsChange={() => setDocumentsRefreshKey((k) => k + 1)}
            />
          </TabsContent>

          <TabsContent value="billing" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <StripeConnectGate>
              <ClientBillingPanel clientId={clientId} />
            </StripeConnectGate>
          </TabsContent>

          <TabsContent value="documents" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <ClientDocumentsPanel clientId={clientId} refreshKey={documentsRefreshKey} />
          </TabsContent>

          <TabsContent value="photos" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <ClientPhotosPanel clientId={clientId} refreshKey={photosRefreshKey} />
          </TabsContent>

          <TabsContent value="messaging" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
            <ClientMessagingPanel clientId={clientId} clientName={client.name} />
          </TabsContent>
        </Card>

        {/* Contact + Notes — only on Jobs tab */}
        {activeTab === 'jobs' && (
        <>
        <div className="flex-[3] grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 max-md:flex-none">
          <Card className="p-6 flex flex-col min-h-0">
            <CardHeader className="pb-3 shrink-0">
              <CardTitle className="font-semibold text-lg">
                Contact Information
              </CardTitle>
            </CardHeader>
            <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">

              {[
                { label: 'Name', field: 'name', value: client.name },
                { label: 'Email', field: 'email', value: client.email },
                { label: 'Phone', field: 'phone', value: client.phone },
              ].map(({ label, field, value }) => (
                <div key={field}>
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
                      className="mt-1"
                    />
                  ) : (
                    <div
                      onClick={() => startEditing(field, (client as any)[field] || '')}
                      className="font-medium cursor-pointer hover:bg-muted/50 px-2 py-1 -mx-2 rounded"
                    >
                      {value || <span className="text-muted-foreground italic">Click to add</span>}
                    </div>
                  )}
                </div>
              ))}

              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">Address</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={openAddressModal}
                  >
                    <Pencil className="size-3 mr-1" />
                    Edit
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={openAddressModal}
                  className="mt-1 w-full text-left rounded-md px-2 py-2 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  {displayAddress ? (
                    <span className="flex items-start gap-2 font-medium text-sm leading-snug">
                      <MapPin className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                      <span>{displayAddress}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">
                      No address — click to add
                    </span>
                  )}
                </button>
              </div>

            </CardContent>
            </ScrollArea>
          </Card>

          <Card className="p-6 flex flex-col">
            <CardHeader>
              <CardTitle className="font-semibold text-lg">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
            <Textarea
              value={client.notes || ''}
              onChange={async (e) => {
                const newNotes = e.target.value
                setClient({ ...client, notes: newNotes })
                clearTimeout((window as any).notesTimeout)
                ;(window as any).notesTimeout = setTimeout(async () => {
                  await updateClientAction({ id: client.id, name: client.name, notes: newNotes })
                }, 800)
              }}
              className="flex-1 min-h-[120px] resize-y"
            />
            </CardContent>
          </Card>

          <Card className="flex p-6">
            <ClientPortalAccess clientId={clientId} clientEmail={client.email} />
          </Card>
        </div>


        </>
        )}
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
