'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { parseAsCompanyTime, formatForDatetimeLocal } from '@/lib/timezone'
import {
  getDashboardUserDataAction,
  getJobAction,
  updateJobAction,
  archiveJobAction,
  cancelJobAction,
  deleteJobAction,
} from '@/app/action'
import { JobPhotosPanel } from '@/components/dashboard/job-photos-panel'
import { JobDocumentsPanel } from '@/components/dashboard/job-documents-panel'
import { JobMessagingPanel } from '@/components/dashboard/job-messaging-panel'
import { MapsNavigateButton } from '@/components/dashboard/maps-navigate-button'
import { getDisplayAddressFromClient } from '@/lib/address'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
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

export default function JobDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const clientId = params.id as string
  const jobId = params.jobId as string

  const [job, setJob] = useState<Job | null>(null)
  const [clientName, setClientName] = useState('')
  const [companyTimezone, setCompanyTimezone] = useState('America/Chicago')
  const [companyId, setCompanyId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [availableCrews, setAvailableCrews] = useState<{ id: string; name: string }[]>([])
  const [conflictInfo, setConflictInfo] = useState<{ message: string; suggestedCrews?: { id: string; name: string }[] } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'archive' | 'cancel' | 'delete' | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
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

  const fetchJob = useCallback(async () => {
    const result = await getJobAction(jobId, clientId)
    if (result.success && result.job) {
      setJob(result.job as Job)
      if (result.job.client?.name) setClientName(result.job.client.name)
    } else {
      toast.error(result.error || 'Failed to load job')
    }
    setIsLoading(false)
  }, [jobId, clientId])

  const fetchCompanyContext = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return
    setCompanyId(profile.company_id)

    const { data: company } = await supabase
      .from('companies')
      .select('timezone')
      .eq('id', profile.company_id)
      .single()

    if (company?.timezone) setCompanyTimezone(company.timezone)
  }, [supabase])

  useEffect(() => {
    fetchJob()
    fetchCompanyContext()
    getDashboardUserDataAction().then((result) => {
      if (result.success) {
        setUserRole(result.profile.role)
      }
    })
  }, [fetchJob, fetchCompanyContext])

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

    const updatePayload: Parameters<typeof updateJobAction>[0] = {
      jobId,
      clientId,
      companyId,
      description: formValues.description,
      endTime: endTimeUTC,
      crewId: formValues.crewId || null,
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
      await fetchJob()
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
        await fetchJob()
        setIsEditing(false)
      }
    } else {
      toast.error(result.error || 'Action failed')
    }

    setIsActionLoading(false)
  }

  if (isLoading || !job) {
    return <div className="p-6">Loading...</div>
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

  return (
    <div className="flex flex-col h-full min-h-0 p-4 sm:p-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-4 sm:mb-6">
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

        <div className="flex flex-col sm:flex-row gap-3 lg:items-center">
          <div className="flex items-center gap-1 bg-card/50 rounded-lg p-1 overflow-x-auto">
            {jobTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3 sm:px-4 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>

      <Card className="flex-1 flex flex-col p-4 sm:p-6 min-h-0">
        {activeTab === 'details' && (
          <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
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
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
                <Card className="p-4 sm:p-6 flex flex-col">
                  <h2 className="font-semibold text-lg mb-4">Job Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Status</div>
                      <div className="font-medium">{statusLabels[job.status] ?? job.status}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Crew</div>
                      <div className="font-medium">
                        {job.crew?.name || <span className="text-muted-foreground italic">Unassigned</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Date</div>
                      <div className="font-medium">
                        {new Date(job.start_time).toLocaleDateString([], {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Time</div>
                      <div className="font-medium">
                        {new Date(job.start_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        {' – '}
                        {new Date(job.end_time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Price</div>
                      <div className="font-medium">
                        {job.price > 0 ? `$${job.price.toFixed(2)}` : <span className="text-muted-foreground italic">Not set</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Recurrence</div>
                      <div className="font-medium">
                        {job.recurring_rule_id ? 'Recurring' : 'One-time'}
                      </div>
                    </div>
                    {isTeamMember && (
                      <div className="md:col-span-2">
                        <div className="text-sm text-muted-foreground">Address</div>
                        <div className="font-medium">{jobAddress}</div>
                        <div className="mt-3 hidden sm:block max-w-sm">
                          <MapsNavigateButton address={jobAddress} className="w-full" />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="p-4 sm:p-6 flex flex-col">
                  <h2 className="font-semibold text-lg mb-4">Description</h2>
                  <p className="text-sm flex-1">
                    {job.description || <span className="text-muted-foreground italic">No description provided.</span>}
                  </p>
                </Card>
              </div>
            )}
          </ScrollArea>
        )}

        {activeTab === 'billing' && (
          <StripeConnectGate>
            <JobBillingPanel scheduleId={jobId} clientId={clientId} />
          </StripeConnectGate>
        )}

        {activeTab === 'photos' && (
          <JobPhotosPanel scheduleId={jobId} clientId={clientId} />
        )}

        {activeTab === 'documents' && (
          <JobDocumentsPanel scheduleId={jobId} clientId={clientId} />
        )}

        {activeTab === 'messaging' && (
          <JobMessagingPanel
            clientId={clientId}
            scheduleId={jobId}
            jobTitle={job.title}
            clientName={clientName}
          />
        )}
      </Card>

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
    </div>
  )
}