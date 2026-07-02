'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Fragment } from 'react'
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogTitle, DialogHeader, DialogContent } from "@/components/ui/dialog"
import { CalendarDays, Users, Banknote } from 'lucide-react';
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
import { updateClientAction, createJobAction, convertEstimateToJobAction, syncScheduleStatusesAction } from '@/app/action'
import { parseAsCompanyTime } from '@/lib/timezone'
import { JobFormFields } from '@/components/dashboard/job-form-fields'
import { JobStatusBadge } from '@/components/dashboard/job-status-badge'
import { ClientBillingPanel } from '@/components/dashboard/client-billing-panel'
import { ClientEstimatesPanel } from '@/components/dashboard/client-estimates-panel'
import { ClientDocumentsPanel } from '@/components/dashboard/client-documents-panel'
import { StripeConnectGate } from '@/components/dashboard/stripe-connect-gate'
import type { Estimate } from '@/lib/estimates'

interface Client {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  status: 'active' | 'archived'
  created_at: string
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const clientId = params.id as string

  const [client, setClient] = useState<Client | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState('')

  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false)
  const [isCreatingJob, setIsCreatingJob] = useState(false)
  const [availableCrews, setAvailableCrews] = useState<any[]>([])
  const [conflictInfo, setConflictInfo] = useState<any>(null)

  const [showArchived, setShowArchived] = useState(false)

  const [activeTab, setActiveTab] = useState<
    'jobs' | 'estimates' | 'billing' |  'documents' | 'messaging'
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

  const [schedules, setSchedules] = useState<any[]>([])
  const [convertingEstimate, setConvertingEstimate] = useState<Estimate | null>(null)
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0)

  const fetchSchedules = async () => {
    const { data, error } = await supabase
      .from('schedules')
      .select(`
        *,
        crew:crews!crew_id (id, name)
      `)
      .eq('client_id', clientId)
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching schedules:', error)
      return
    }

    // Add crew conflict detection
    const schedulesWithConflict = await Promise.all(
      (data || []).map(async (schedule) => {
        if (!schedule.crew?.id || schedule.status === 'archived') {
          return { ...schedule, hasCrewConflict: false }
        }

        const { data: conflicts } = await supabase
          .from('schedules')
          .select('id')
          .eq('crew_id', schedule.crew.id)
          .neq('id', schedule.id)
          .neq('status', 'archived')
          .lte('start_time', schedule.end_time)
          .gte('end_time', schedule.start_time)

        return {
          ...schedule,
          hasCrewConflict: !!(conflicts && conflicts.length > 0),
        }
      })
    )

    setSchedules(schedulesWithConflict)
  }

  const fetchClient = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (error) {
      console.error('Error fetching client:', error)
      return
    }
    setClient(data)
    setIsLoading(false)
  }

  useEffect(() => {
    if (clientId) {
      fetchClient()
      fetchSchedules()
    }
  }, [clientId])

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
      alert('Failed to save changes')
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
    const newEndTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000)
      .toISOString()
      .slice(0, 16)

    setNewJob(prev => ({ ...prev, startTime, endTime: newEndTime }))
    refreshAvailableCrews(startTime, newEndTime)
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
      alert('Title, start time, and end time are required')
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

    const result = estimateBeingConverted
      ? await convertEstimateToJobAction({
          estimateId: estimateBeingConverted.id,
          clientId,
          companyId: profile?.company_id || '',
          crewId: newJob.crewId || null,
          title: newJob.title,
          description: newJob.description,
          startTime: startTimeUTC,
          endTime: endTimeUTC,
          recurrence: newJob.recurrence,
        })
      : await createJobAction({
          clientId,
          crewId: newJob.crewId || null,
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
      setIsAddJobModalOpen(false)
      setConflictInfo(null)
      await fetchSchedules()
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
        alert(result.error || 'Failed to create job')
      }
    }

    setIsCreatingJob(false)
  }

  const updateScheduleStatuses = async () => {
    console.log('=== Sync Statuses (Client) ===')

    try {
      const result = await syncScheduleStatusesAction(clientId)

      console.log('Server Action result:', result)

      if (result.success) {
        console.log('Statuses synced:', result.message)
        await fetchSchedules()
      } else {
        console.error('Server Action failed:', result.error)
      }
    } catch (error) {
      console.error('Error calling sync action:', error)
    }

    console.log('=== Sync complete ===')
  }

  useEffect(() => {
    if (clientId) {
      // Run once immediately when the page loads
      updateScheduleStatuses();

      // Then run automatically every 60 seconds
      const interval = setInterval(() => {
        updateScheduleStatuses();
      }, 60 * 1000); // 60 seconds

      // Cleanup when leaving the page
      return () => clearInterval(interval);
    }
  }, [clientId]);

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
    return <div className="p-6">Loading...</div>
  }

  const visibleSchedules = showArchived
      ? schedules
      : schedules.filter(schedule => schedule.status !== 'archived')

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-2rem)]">
    {/* Header */}
    <div className="flex items-center justify-between mb-6">
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
        <h1 className="text-3xl font-bold tracking-tight mt-2">{client.name}</h1>
      </div>

      {/* Center: Tab Navigation */}
      <div className="flex items-center gap-1 bg-card/50 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'jobs' ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
          }`}
        >
          Jobs
        </button>
        <button
          onClick={() => setActiveTab('estimates')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'estimates' ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
          }`}
        >
          Estimates
        </button>
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'billing' ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
          }`}
        >
          Billing
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'documents' ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
          }`}
        >
          Documents
        </button>
        <button
          onClick={() => setActiveTab('messaging')}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'messaging' ? 'bg-card shadow-sm font-medium' : 'hover:bg-background'
          }`}
        >
          Messaging
        </button>
      </div>

      {/* Right side: Back button */}
      <Button variant="outline" onClick={() => router.push('/dashboard/clients')}>
        Back to Clients
      </Button>
    </div>

      {/* Main Content */}
      <div className="flex flex-col flex-1 min-h-0 gap-6">
        {/* Schedules */}
        <Card className="flex-[7] flex flex-col p-6 min-h-0">
          {/* Tab Content Area - Full card is now used for the active page */}

          {activeTab === 'jobs' && (
            <>
              {/* Header row for Jobs tab */}
              <div className="flex items-center justify-between mb-4">
                {/* Show Archived Toggle */}
                <div className="flex items-center gap-2">
                  <Switch
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                  />
                  <span className="text-sm text-muted-foreground">Show archived</span>
                </div>

                {/* Add Job Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsAddJobModalOpen(true)
                    setConflictInfo(null)
                  }}
                >
                  + Add Job
                </Button>
              </div>

              {/* Jobs List */}
              {visibleSchedules.length > 0 ? (
                <div className="scroll-fade space-y-4 overflow-auto">   {/* reduced space-y a bit */}
                  {visibleSchedules.map((schedule, index) => (
                    <Fragment key={schedule.id}>
                      {/* Job Card Row */}
                      <div className="h-32 flex items-center mx-1 my-3 group">
                        {/* Your existing left accent bar */}
                        <div className="h-full flex">
                          {schedule.recurring_rule_id && (
                            <div className="w-1 mr-2 rounded-full h-full bg-purple-400" />
                          )}
                        </div>

                        <Card
                          className="flex flex-row flex-1 w-full h-full overflow-hidden hover:shadow-md transition-all bg-background hover:bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => router.push(`/dashboard/clients/${clientId}/jobs/${schedule.id}`)}
                        >

                          {/* SECTION 1: Title */}
                          <div className="flex-1 flex flex-col min-w-0">
                            <CardHeader className="px-6">
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
                          <Separator orientation="vertical" className="h-auto" />

                          {/* SECTION 2: Status & Crew */}
                          <div className="flex-1 flex flex-col min-w-0">
                            <CardHeader className="px-6">
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
                          <Separator orientation="vertical" className="h-auto" />

                          {/* SECTION 3: Price */}
                          <div className="flex-1 flex flex-col min-w-0">
                            <CardHeader className="px-6">
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
              ) : (
                <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
                  <p className="text-muted-foreground">No jobs scheduled yet for this client.</p>
                </div>
              )}
            </>
          )}

          {/* Other Tab Pages (full card content) */}
          {activeTab === 'estimates' && (
            <ClientEstimatesPanel
              clientId={clientId}
              onConvertToJob={handleConvertToJob}
              onDocumentsChange={() => setDocumentsRefreshKey((k) => k + 1)}
            />
          )}

          {activeTab === 'billing' && (
            <StripeConnectGate>
              <ClientBillingPanel clientId={clientId} />
            </StripeConnectGate>
          )}

          {activeTab === 'documents' && (
            <ClientDocumentsPanel clientId={clientId} refreshKey={documentsRefreshKey} />
          )}

          {activeTab === 'messaging' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-4">💬</div>
              <h3 className="text-xl font-semibold mb-2">Messaging</h3>
              <p className="text-muted-foreground max-w-md">
                Communicate directly with this client through the portal.
              </p>
            </div>
          )}
        </Card>

        {/* Contact + Notes — only on Jobs tab */}
        {activeTab === 'jobs' && (
        <div className="flex-[3] grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          <Card className="p-6 flex flex-col">
            <h2 className="font-semibold text-lg mb-4">Contact Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 flex-1">
              {[
                { label: 'Name', field: 'name', value: client.name },
                { label: 'Email', field: 'email', value: client.email },
                { label: 'Phone', field: 'phone', value: client.phone },
                { label: 'Address', field: 'address', value: client.address },
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
            </div>
          </Card>

          <Card className="p-6 flex flex-col">
            <h2 className="font-semibold text-lg mb-4">Notes</h2>
            <textarea
              value={client.notes || ''}
              onChange={async (e) => {
                const newNotes = e.target.value
                setClient({ ...client, notes: newNotes })
                clearTimeout((window as any).notesTimeout)
                ;(window as any).notesTimeout = setTimeout(async () => {
                  await updateClientAction({ id: client.id, name: client.name, notes: newNotes })
                }, 800)
              }}
              className="flex-1 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </Card>
        </div>
        )}
      </div>

      {/* Add Job Modal */}
      <Dialog
        open={isAddJobModalOpen}
        onOpenChange={(open) => {
          setIsAddJobModalOpen(open)
          if (!open) setConvertingEstimate(null)
        }}
      >
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {convertingEstimate ? 'Convert Estimate to Job' : 'Add New Job'}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <JobFormFields
              values={newJob}
              onChange={setNewJob}
              availableCrews={availableCrews}
              conflictInfo={conflictInfo}
              onStartTimeChange={handleStartTimeChange}
              onEndTimeChange={handleEndTimeChange}
              onCrewChange={handleCrewChange}
              disabledFields={convertingEstimate ? { price: true } : undefined}
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
    </div>
  )
}
