'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseAsCompanyTime, formatForDatetimeLocal } from '@/lib/timezone'
import {
  getJobDetailPageAction,
  updateJobAction,
  archiveJobAction,
  cancelJobAction,
  deleteJobAction,
} from '@/app/action'
import { SOLO_CREW_NAME } from '@/lib/company-operations'
import { JobDetailsPanel } from '@/components/dashboard/job-details-panel'
import { JobPhotosPanel } from '@/components/dashboard/job-photos-panel'
import { JobDocumentsPanel } from '@/components/dashboard/job-documents-panel'
import { JobMessagingPanel } from '@/components/dashboard/job-messaging-panel'
import { MapsNavigateButton } from '@/components/dashboard/maps-navigate-button'
import { getDisplayAddressFromClient } from '@/lib/address'
import { Button } from '@/components/ui/button'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { JobFormFields, type JobFormValues } from '@/components/dashboard/job-form-fields'
import { JobBillingPanel } from '@/components/dashboard/job-billing-panel'
import { StripeConnectGate } from '@/components/dashboard/stripe-connect-gate'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

const statusLabels: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  archived: 'Archived',
  cancelled: 'Cancelled',
}

interface Job {
  id: string
  client_id: string
  crew_id: string | null
  recurring_rule_id: string | null
  title: string
  description: string | null
  start_time: string
  end_time: string
  status: string
  price: number
  crew?: { id: string; name: string } | null
  client?: {
    id: string
    name: string
    address?: string | null
    address_street?: string | null
    address_unit?: string | null
    address_city?: string | null
    address_state?: string | null
    address_zip?: string | null
  } | null
}

type JobDetailPageClientProps = {
  clientId: string
  jobId: string
  initialJob: Job
  initialCompanyTimezone: string
  initialUserRole: string
  initialIsSoloBusiness: boolean
  initialSoloCrewId: string | null
  initialCompanyId: string
}

export function JobDetailPageClient({
  clientId,
  jobId,
  initialJob,
  initialCompanyTimezone,
  initialUserRole,
  initialIsSoloBusiness,
  initialSoloCrewId,
  initialCompanyId,
}: JobDetailPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [job, setJob] = useState<Job | null>(initialJob)
  const [clientName, setClientName] = useState(initialJob.client?.name || '')
  const [companyTimezone, setCompanyTimezone] = useState(initialCompanyTimezone)
  const [companyId, setCompanyId] = useState(initialCompanyId)
  const [isLoading, setIsLoading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableCrews, setAvailableCrews] = useState<{ id: string; name: string }[]>([])
  const [conflictInfo, setConflictInfo] = useState<{ message: string; suggestedCrews?: { id: string; name: string }[] } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'archive' | 'cancel' | 'delete' | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(initialUserRole)
  const [isSoloBusiness, setIsSoloBusiness] = useState(initialIsSoloBusiness)
  const [soloCrewId, setSoloCrewId] = useState<string | null>(initialSoloCrewId)
  const [activeTab, setActiveTab] = useState<
    'details' | 'billing' | 'photos' | 'documents' | 'messaging'
  >('details')

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'billing' || tab === 'photos' || tab === 'documents' || tab === 'messaging') {
      setActiveTab(tab)
    }
  }, [searchParams])

  const isTeamMember = userRole === 'team_member'

  const jobTabs = [
    { id: 'details' as const, label: 'Details' },
    ...(isTeamMember
      ? [
          { id: 'photos' as const, label: 'Photos' },
          { id: 'messaging' as const, label: 'Messaging' },
        ]
      : [
          { id: 'billing' as const, label: 'Billing' },
          { id: 'photos' as const, label: 'Photos' },
          { id: 'documents' as const, label: 'Documents' },
          { id: 'messaging' as const, label: 'Messaging' },
        ]),
  ]

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    if (isEditing) {
      setIsEditing(false)
      setConflictInfo(null)
    }
  }

  const [formValues, setFormValues] = useState<JobFormValues>({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    crewId: '',
    recurrence: 'none',
    price: '',
  })

  const refreshJob = useCallback(async () => {
    const result = await getJobDetailPageAction(jobId, clientId)
    if (result.success) {
      setJob(result.data.job as Job)
      if (result.data.job.client?.name) setClientName(result.data.job.client.name)
      setCompanyTimezone(result.data.companyTimezone)
      setCompanyId(result.data.companyId)
      setUserRole(result.data.userRole)
      setIsSoloBusiness(result.data.isSoloBusiness)
      setSoloCrewId(result.data.soloCrewId)
    } else {
      toast.error(result.error || 'Failed to load job')
    }
    setIsLoading(false)
  }, [jobId, clientId])

  useEffect(() => {
    const teamMemberTabs = ['details', 'photos', 'messaging'] as const
    if (
      userRole === 'team_member' &&
      !teamMemberTabs.includes(activeTab as (typeof teamMemberTabs)[number])
    ) {
      setActiveTab('details')
    }
  }, [userRole, activeTab])

  const populateFormFromJob = useCallback((j: Job, tz: string) => {
    setFormValues({
      title: j.title,
      description: j.description || '',
      startTime: formatForDatetimeLocal(j.start_time, tz),
      endTime: formatForDatetimeLocal(j.end_time, tz),
      crewId: j.crew_id || '',
      recurrence: 'none',
      price: j.price > 0 ? j.price.toString() : '',
    })
  }, [])

  useEffect(() => {
    if (job && companyTimezone) {
      populateFormFromJob(job, companyTimezone)
    }
  }, [job, companyTimezone, populateFormFromJob])

  const refreshAvailableCrews = async (start: string, end: string, excludeJobId?: string) => {
    if (!start || !end || !companyId) return

    const { data: crews } = await supabase
      .from('crews')
      .select('id, name')
      .eq('company_id', companyId)

    if (!crews) return

    const startUTC = parseAsCompanyTime(start, companyTimezone)
    const endUTC = parseAsCompanyTime(end, companyTimezone)
    const available = []

    for (const crew of crews) {
      let query = supabase
        .from('schedules')
        .select('id')
        .eq('crew_id', crew.id)
        .neq('status', 'archived')
        .neq('status', 'cancelled')
        .lte('start_time', endUTC)
        .gte('end_time', startUTC)

      if (excludeJobId) {
        query = query.neq('id', excludeJobId)
      }

      const { data: conflicts } = await query
      if (!conflicts || conflicts.length === 0) {
        available.push(crew)
      }
    }

    if (job?.crew_id && !available.find((c) => c.id === job.crew_id)) {
      const assigned = crews.find((c) => c.id === job.crew_id)
      if (assigned) available.unshift(assigned)
    }

    setAvailableCrews(available)
  }

  const handleStartEditing = () => {
    if (job) {
      populateFormFromJob(job, companyTimezone)
      refreshAvailableCrews(
        formatForDatetimeLocal(job.start_time, companyTimezone),
        formatForDatetimeLocal(job.end_time, companyTimezone),
        job.id
      )
    }
    setConflictInfo(null)
    setIsEditing(true)
  }

  const handleStartTimeChange = (startTime: string) => {
    const newEndTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)

    setFormValues((prev) => ({ ...prev, startTime, endTime: newEndTime }))
    refreshAvailableCrews(startTime, newEndTime, jobId)
    setConflictInfo(null)
  }

  const handleEndTimeChange = (endTime: string) => {
    setFormValues((prev) => ({ ...prev, endTime }))
    refreshAvailableCrews(formValues.startTime, endTime, jobId)
    setConflictInfo(null)
  }

  const handleCrewChange = async (crewId: string) => {
    setFormValues((prev) => ({ ...prev, crewId }))
    setConflictInfo(null)

    if (crewId && formValues.startTime && formValues.endTime) {
      const startUTC = parseAsCompanyTime(formValues.startTime, companyTimezone)
      const endUTC = parseAsCompanyTime(formValues.endTime, companyTimezone)

      const { data: conflicts } = await supabase
        .from('schedules')
        .select('id')
        .eq('crew_id', crewId)
        .neq('id', jobId)
        .neq('status', 'archived')
        .neq('status', 'cancelled')
        .lte('start_time', endUTC)
        .gte('end_time', startUTC)

      if (conflicts && conflicts.length > 0) {
        setConflictInfo({ message: 'This crew has a conflict with the selected time range.' })
        setFormValues((prev) => ({ ...prev, crewId: '' }))
        refreshAvailableCrews(formValues.startTime, formValues.endTime, jobId)
      }
    }
  }

  const handleSave = async () => {
    if (!formValues.title || !formValues.startTime || !formValues.endTime) {
      toast.error('Title, start time, and end time are required')
      return
    }

    setIsSaving(true)

    const startTimeUTC = parseAsCompanyTime(formValues.startTime, companyTimezone)
    const endTimeUTC = parseAsCompanyTime(formValues.endTime, companyTimezone)

    const resolvedCrewId =
      isSoloBusiness && soloCrewId ? soloCrewId : formValues.crewId || null

    const updatePayload: Parameters<typeof updateJobAction>[0] = {
      jobId,
      clientId,
      companyId,
      description: formValues.description,
      endTime: endTimeUTC,
      crewId: resolvedCrewId,
      price: parseFloat(formValues.price) || 0,
    }

    if (job?.status === 'scheduled') {
      updatePayload.title = formValues.title
      updatePayload.startTime = startTimeUTC
    }

    const result = await updateJobAction(updatePayload)

    if (result.success) {
      toast.success('Job updated')
      setIsEditing(false)
      setConflictInfo(null)
      await refreshJob()
    } else {
      if (result.suggestedCrews && result.suggestedCrews.length > 0) {
        setAvailableCrews(result.suggestedCrews)
        setConflictInfo({ message: result.error || 'Crew conflict', suggestedCrews: result.suggestedCrews })
      } else {
        toast.error(result.error || 'Failed to update job')
      }
    }

    setIsSaving(false)
  }

  const handleConfirmAction = async () => {
    if (!confirmAction) return
    setIsActionLoading(true)

    const result =
      confirmAction === 'archive'
        ? await archiveJobAction(jobId, clientId)
        : confirmAction === 'cancel'
          ? await cancelJobAction(jobId, clientId)
          : await deleteJobAction(jobId, clientId)

    if (result.success) {
      toast.success(
        confirmAction === 'archive'
          ? 'Job archived'
          : confirmAction === 'cancel'
            ? 'Job cancelled'
            : 'Job deleted'
      )
      setConfirmAction(null)
      if (confirmAction === 'delete') {
        router.push(`/dashboard/clients/${clientId}`)
      } else {
        await refreshJob()
        setIsEditing(false)
      }
    } else {
      toast.error(result.error || 'Action failed')
    }

    setIsActionLoading(false)
  }

  if (isLoading || !job) {
    return (
      <div className="flex h-full min-h-0 flex-col p-6">
        <PageLoadingSkeleton />
      </div>
    )
  }

  const canEdit = !isTeamMember && (job.status === 'scheduled' || job.status === 'in_progress')
  const canArchive = !isTeamMember && job.status === 'in_progress'
  const canCancel = !isTeamMember && job.status === 'scheduled'
  const canDelete = !isTeamMember && (job.status === 'scheduled' || job.status === 'cancelled')

  const jobMeta = [
    statusLabels[job.status] ?? job.status,
    job.recurring_rule_id ? 'Recurring' : null,
  ].filter(Boolean).join(' · ')

  const disabledFields: Partial<Record<keyof JobFormValues, boolean>> =
    job.status === 'in_progress'
      ? { title: true, startTime: true, recurrence: true }
      : {}

  const jobAddress = job.client
    ? getDisplayAddressFromClient(job.client) || 'No address on file'
    : 'No address on file'

  const jobTabSwitcher = (
    <TabsList className="h-auto w-max max-w-full overflow-x-auto max-md:w-full">
      {jobTabs.map((tab) => (
        <TabsTrigger
          key={tab.id}
          value={tab.id}
          className="px-3 sm:px-4 py-2 text-sm whitespace-nowrap"
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  )

  const jobActionButtons = (
    <div className="flex items-center gap-2 flex-wrap justify-end max-md:justify-stretch max-md:[&_button]:min-h-11 max-md:[&_button]:flex-1">
      {activeTab === 'details' && canEdit && !isEditing && (
        <Button variant="outline" onClick={handleStartEditing}>Edit</Button>
      )}
      {activeTab === 'details' && isEditing && (
        <>
          <Button variant="outline" onClick={() => { setIsEditing(false); setConflictInfo(null) }}>
            Cancel Edit
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </>
      )}
      {canCancel && !isEditing && (
        <Button variant="outline" onClick={() => setConfirmAction('cancel')}>
          Cancel Job
        </Button>
      )}
      {canArchive && !isEditing && (
        <Button variant="outline" onClick={() => setConfirmAction('archive')}>Complete Early</Button>
      )}
      {canDelete && !isEditing && (
        <Button variant="destructive" onClick={() => setConfirmAction('delete')}>Delete</Button>
      )}
    </div>
  )

  const jobTitleBlock = (
    <div className="min-w-0">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href={isTeamMember ? '/dashboard/team' : '/dashboard/clients'}>
              {isTeamMember ? 'My Day' : 'Clients'}
            </BreadcrumbLink>
          </BreadcrumbItem>
          {!isTeamMember && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/dashboard/clients/${clientId}`}>
                  {clientName || 'Client'}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </>
          )}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{job.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-2">{job.title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{jobMeta}</p>
      {isTeamMember && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{jobAddress}</p>
      )}
    </div>
  )

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) =>
        handleTabChange(value as 'details' | 'billing' | 'photos' | 'documents' | 'messaging')
      }
      className="flex flex-col h-full min-h-0 p-4 sm:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-6"
    >
      {isTeamMember ? (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4 sm:mb-6">
          {jobTitleBlock}
          <div className="flex flex-col sm:flex-row gap-3 lg:items-center">
            {jobTabSwitcher}
            {jobActionButtons}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 mb-4 sm:mb-6 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
          <div className="min-w-0 lg:justify-self-start">{jobTitleBlock}</div>
          <div className="flex justify-center lg:justify-self-center">{jobTabSwitcher}</div>
          <div className="lg:justify-self-end max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:border-t max-md:bg-background/95 max-md:backdrop-blur max-md:p-4 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {jobActionButtons}
          </div>
        </div>
      )}

      <MainPageCard className="p-4 sm:p-6">
        <TabsContent value="details" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
          <MainPageCardScroll>
            {isEditing ? (
              <div className="max-w-2xl">
                <h2 className="text-lg font-semibold tracking-tight mb-4">Edit Job</h2>
                <JobFormFields
                  values={formValues}
                  onChange={setFormValues}
                  availableCrews={availableCrews}
                  conflictInfo={conflictInfo}
                  onStartTimeChange={handleStartTimeChange}
                  onEndTimeChange={handleEndTimeChange}
                  onCrewChange={handleCrewChange}
                  showRecurrence={false}
                  disabledFields={disabledFields}
                  isSoloBusiness={isSoloBusiness}
                  soloCrewName={SOLO_CREW_NAME}
                />
              </div>
            ) : (
              <JobDetailsPanel
                job={job}
                clientName={clientName}
                clientId={clientId}
                jobAddress={jobAddress}
                isTeamMember={isTeamMember}
              />
            )}
          </MainPageCardScroll>
        </TabsContent>

        <TabsContent value="billing" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
          <StripeConnectGate>
            <JobBillingPanel scheduleId={jobId} clientId={clientId} />
          </StripeConnectGate>
        </TabsContent>

        <TabsContent value="photos" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
          <JobPhotosPanel scheduleId={jobId} clientId={clientId} />
        </TabsContent>

        <TabsContent value="documents" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
          <JobDocumentsPanel scheduleId={jobId} clientId={clientId} />
        </TabsContent>

        <TabsContent value="messaging" className="flex flex-col flex-1 min-h-0 mt-0 outline-none">
          <JobMessagingPanel
            clientId={clientId}
            scheduleId={jobId}
            jobTitle={job.title}
            clientName={clientName}
          />
        </TabsContent>
      </MainPageCard>

      {isTeamMember && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <MapsNavigateButton address={jobAddress} size="lg" className="w-full" />
        </div>
      )}

      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'archive'
                ? 'Complete Job Early'
                : confirmAction === 'cancel'
                  ? 'Cancel Job'
                  : 'Delete Job'}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'archive'
                ? 'This will mark the job as completed/archived before its scheduled end time.'
                : confirmAction === 'cancel'
                  ? 'This will cancel the scheduled job. It will remain on the schedule as cancelled and can be deleted later.'
                  : 'This will permanently delete the job. This action cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmAction(null)}>Back</Button>
            <Button
              variant={confirmAction === 'delete' ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
              disabled={isActionLoading}
            >
              {isActionLoading
                ? 'Processing...'
                : confirmAction === 'cancel'
                  ? 'Cancel Job'
                  : 'Confirm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Tabs>
  )
}