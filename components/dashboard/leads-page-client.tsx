'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowRight,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  addLeadActivityAction,
  archiveLeadAction,
  convertLeadToClientAction,
  createLeadAction,
  getLeadActivitiesAction,
  getLeadsAction,
  restoreLeadAction,
  updateLeadAction,
  updateLeadStatusAction,
} from '@/app/action'
import { StructuredAddressForm } from '@/components/dashboard/company-address-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  emptyStructuredAddress,
  normalizeStructuredAddress,
  structuredAddressFromRow,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'
import {
  formatFollowUpLabel,
  fromDatetimeLocalValue,
  getFollowUpUrgency,
  isActiveLeadStatus,
  LEAD_PIPELINE_STATUSES,
  LEAD_PRIORITIES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STATUS_LABELS,
  sortLeadsByPriority,
  toDatetimeLocalValue,
  type Lead,
  type LeadActivity,
  type LeadPipelineStatus,
  type LeadPriority,
  type LeadSource,
  type LeadStatus,
} from '@/lib/leads'
import { matchesSearch } from '@/lib/search'

type LeadFormState = {
  name: string
  contact_name: string
  email: string
  phone: string
  source: LeadSource
  status: LeadStatus
  priority: LeadPriority
  follow_up_at: string
  notes: string
  estimated_value: string
}

function emptyLeadForm(): LeadFormState {
  return {
    name: '',
    contact_name: '',
    email: '',
    phone: '',
    source: 'other',
    status: 'new',
    priority: 'normal',
    follow_up_at: '',
    notes: '',
    estimated_value: '',
  }
}

function leadToForm(lead: Lead): LeadFormState {
  return {
    name: lead.name,
    contact_name: lead.contact_name || '',
    email: lead.email || '',
    phone: lead.phone || '',
    source: lead.source,
    status: lead.status,
    priority: lead.priority,
    follow_up_at: toDatetimeLocalValue(lead.follow_up_at),
    notes: lead.notes || '',
    estimated_value: lead.estimated_value != null ? String(lead.estimated_value) : '',
  }
}

function FollowUpBadge({ followUpAt }: { followUpAt: string | null }) {
  const urgency = getFollowUpUrgency(followUpAt)
  if (urgency === 'none') {
    return <span className="text-xs text-muted-foreground">No follow-up</span>
  }

  const variant =
    urgency === 'overdue' ? 'destructive' : urgency === 'today' ? 'default' : 'secondary'

  return (
    <Badge variant={variant} className="text-xs font-normal">
      {formatFollowUpLabel(followUpAt)}
    </Badge>
  )
}

function LeadKanbanCard({
  lead,
  onOpen,
  onDragStart,
}: {
  lead: Lead
  onOpen: (lead: Lead) => void
  onDragStart: (leadId: string) => void
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart(lead.id)}
      onClick={() => onOpen(lead)}
      className="w-full rounded-lg border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing"
    >
      <div className="font-medium text-sm truncate">{lead.name}</div>
      {lead.contact_name && (
        <div className="text-xs text-muted-foreground truncate mt-0.5">{lead.contact_name}</div>
      )}
      <div className="mt-2">
        <FollowUpBadge followUpAt={lead.follow_up_at} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{LEAD_SOURCE_LABELS[lead.source]}</span>
        {lead.estimated_value != null && lead.estimated_value > 0 && (
          <span className="font-medium text-foreground">
            ${lead.estimated_value.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  )
}

export function LeadsPageClient() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<'create' | 'edit'>('create')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm())
  const [leadAddress, setLeadAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [activities, setActivities] = useState<LeadActivity[]>([])
  const [activityNote, setActivityNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    setIsLoading(true)
    const result = await getLeadsAction({ includeArchived: showArchived })
    if (result.success) {
      setLeads(result.data)
    } else {
      toast.error(result.error)
    }
    setIsLoading(false)
  }, [showArchived])

  useEffect(() => {
    fetchLeads()
  }, [fetchLeads])

  const filteredLeads = useMemo(() => {
    let items = leads.filter((lead) =>
      matchesSearch(
        searchTerm,
        lead.name,
        lead.contact_name,
        lead.email,
        lead.phone,
        lead.notes,
        LEAD_SOURCE_LABELS[lead.source],
        LEAD_STATUS_LABELS[lead.status]
      )
    )

    if (!showArchived) {
      items = items.filter((lead) => isActiveLeadStatus(lead.status))
    }

    if (statusFilter !== 'all') {
      items = items.filter((lead) => lead.status === statusFilter)
    }

    return sortLeadsByPriority(items)
  }, [leads, searchTerm, statusFilter, showArchived])

  const leadsByStatus = useMemo(() => {
    const map = Object.fromEntries(
      LEAD_PIPELINE_STATUSES.map((status) => [status, [] as Lead[]])
    ) as Record<LeadPipelineStatus, Lead[]>

    for (const lead of filteredLeads) {
      if (lead.status === 'archived') continue
      if (LEAD_PIPELINE_STATUSES.includes(lead.status as LeadPipelineStatus)) {
        map[lead.status as LeadPipelineStatus].push(lead)
      }
    }

    for (const status of LEAD_PIPELINE_STATUSES) {
      map[status] = sortLeadsByPriority(map[status])
    }

    return map
  }, [filteredLeads])

  const openCreateSheet = () => {
    setSheetMode('create')
    setSelectedLead(null)
    setForm(emptyLeadForm())
    setLeadAddress(emptyStructuredAddress())
    setAddressErrors({})
    setActivities([])
    setActivityNote('')
    setSheetOpen(true)
  }

  const openEditSheet = async (lead: Lead) => {
    setSheetMode('edit')
    setSelectedLead(lead)
    setForm(leadToForm(lead))
    setLeadAddress(structuredAddressFromRow(lead))
    setAddressErrors({})
    setActivityNote('')
    setSheetOpen(true)

    const result = await getLeadActivitiesAction(lead.id)
    if (result.success) {
      setActivities(result.data)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Lead name is required')
      return
    }

    const addressValidation = validateStructuredAddressIfPresent(normalizeStructuredAddress(leadAddress))
    if (!addressValidation.valid) {
      setAddressErrors(addressValidation.errors)
      toast.error('Please fix the address fields')
      return
    }

    setIsSaving(true)
    const estimatedValue = form.estimated_value.trim()
      ? Number.parseFloat(form.estimated_value)
      : null

    const payload = {
      name: form.name,
      contact_name: form.contact_name,
      email: form.email,
      phone: form.phone,
      leadAddress: normalizeStructuredAddress(leadAddress),
      source: form.source,
      status: form.status,
      priority: form.priority,
      follow_up_at: fromDatetimeLocalValue(form.follow_up_at),
      notes: form.notes,
      estimated_value:
        estimatedValue != null && !Number.isNaN(estimatedValue) ? estimatedValue : null,
    }

    const result =
      sheetMode === 'create'
        ? await createLeadAction(payload)
        : await updateLeadAction({ id: selectedLead!.id, ...payload })

    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(sheetMode === 'create' ? 'Lead created' : 'Lead updated')
    setSheetOpen(false)
    fetchLeads()
  }

  const handleStatusChange = async (leadId: string, status: LeadStatus) => {
    const result = await updateLeadStatusAction(leadId, status)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setLeads((prev) =>
      prev.map((lead) => (lead.id === leadId ? { ...lead, ...result.data } : lead))
    )
    if (selectedLead?.id === leadId) {
      setSelectedLead(result.data)
      setForm(leadToForm(result.data))
    }
  }

  const handleArchive = async () => {
    if (!selectedLead) return
    const result = await archiveLeadAction(selectedLead.id)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Lead archived')
    setSheetOpen(false)
    fetchLeads()
  }

  const handleRestore = async () => {
    if (!selectedLead) return
    const result = await restoreLeadAction(selectedLead.id)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Lead restored')
    setSheetOpen(false)
    fetchLeads()
  }

  const handleConvert = async () => {
    if (!selectedLead) return
    setIsSaving(true)
    const result = await convertLeadToClientAction(selectedLead.id)
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(
      result.alreadyConverted ? 'Lead already converted' : 'Lead converted to client'
    )
    setSheetOpen(false)
    router.push(`/dashboard/clients/${result.clientId}`)
  }

  const handleAddNote = async () => {
    if (!selectedLead || !activityNote.trim()) return
    const result = await addLeadActivityAction(selectedLead.id, activityNote)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setActivityNote('')
    const activitiesResult = await getLeadActivitiesAction(selectedLead.id)
    if (activitiesResult.success) {
      setActivities(activitiesResult.data)
    }
  }

  return (
    <div className="p-6 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">
            Track prospects, follow up on time, and convert them to clients
          </p>
        </div>
        <Button onClick={openCreateSheet}>
          <Plus className="size-4" />
          Add Lead
        </Button>
      </div>

      <MainPageCard className="overflow-hidden p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-6 shrink-0">
          <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
            />

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter((value ?? 'all') as 'all' | LeadStatus)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {LEAD_PIPELINE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {LEAD_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="show-archived-leads"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="show-archived-leads" className="text-sm">
                Show archived
              </Label>
            </div>
          </div>

          <Tabs
            value={viewMode}
            onValueChange={(value) => setViewMode(value as 'list' | 'board')}
          >
            <TabsList>
              <TabsTrigger value="list">
                <List className="size-4" />
                List
              </TabsTrigger>
              <TabsTrigger value="board">
                <LayoutGrid className="size-4" />
                Board
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground">
              {searchTerm || statusFilter !== 'all'
                ? 'No leads match your filters.'
                : 'No leads yet. Add your first prospect to get started.'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <MainPageCardScroll>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Lead</th>
                    <th className="p-3 font-medium">Follow-up</th>
                    <th className="p-3 font-medium">Stage</th>
                    <th className="p-3 font-medium">Source</th>
                    <th className="p-3 font-medium text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => openEditSheet(lead)}
                      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[lead.contact_name, lead.email, lead.phone].filter(Boolean).join(' · ') ||
                            'No contact details'}
                        </div>
                      </td>
                      <td className="p-3">
                        <FollowUpBadge followUpAt={lead.follow_up_at} />
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{LEAD_STATUS_LABELS[lead.status]}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {LEAD_SOURCE_LABELS[lead.source]}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {lead.estimated_value != null && lead.estimated_value > 0
                          ? `$${lead.estimated_value.toLocaleString()}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MainPageCardScroll>
        ) : (
          <MainPageCardScroll contentClassName="min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 min-w-[960px] pb-2">
              {LEAD_PIPELINE_STATUSES.map((status) => (
                <div
                  key={status}
                  className="flex flex-col min-h-[320px] rounded-lg border bg-muted/20"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (draggedLeadId) {
                      handleStatusChange(draggedLeadId, status)
                      setDraggedLeadId(null)
                    }
                  }}
                >
                  <div className="px-3 py-2 border-b flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{LEAD_STATUS_LABELS[status]}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {leadsByStatus[status].length}
                    </Badge>
                  </div>
                  <div className="p-2 space-y-2 flex-1">
                    {leadsByStatus[status].map((lead) => (
                      <LeadKanbanCard
                        key={lead.id}
                        lead={lead}
                        onOpen={openEditSheet}
                        onDragStart={setDraggedLeadId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </MainPageCardScroll>
        )}
      </MainPageCard>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <SheetTitle>
              {sheetMode === 'create' ? 'New Lead' : selectedLead?.name || 'Lead'}
            </SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 min-h-0" viewportClassName="scroll-fade">
            <div className="px-6 py-5 space-y-5">
              <div>
                <Label>Business / lead name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                  placeholder="Smith Residence, ABC Plumbing..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Contact name</Label>
                  <Input
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Source</Label>
                  <Select
                    value={form.source}
                    onValueChange={(value) =>
                      setForm({ ...form, source: (value ?? 'other') as LeadSource })
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((source) => (
                        <SelectItem key={source} value={source}>
                          {LEAD_SOURCE_LABELS[source]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Stage</Label>
                  <Select
                    value={form.status}
                    onValueChange={(value) =>
                      setForm({ ...form, status: (value ?? 'new') as LeadStatus })
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_PIPELINE_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {LEAD_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(value) =>
                      setForm({ ...form, priority: (value ?? 'normal') as LeadPriority })
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estimated value</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.estimated_value}
                    onChange={(e) => setForm({ ...form, estimated_value: e.target.value })}
                    className="mt-1"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label>Next follow-up</Label>
                <Input
                  type="datetime-local"
                  value={form.follow_up_at}
                  onChange={(e) => setForm({ ...form, follow_up_at: e.target.value })}
                  className="mt-1"
                />
              </div>

              <StructuredAddressForm
                value={leadAddress}
                onChange={(value) => {
                  setLeadAddress(value)
                  if (Object.keys(addressErrors).length > 0) setAddressErrors({})
                }}
                errors={addressErrors}
                idPrefix="lead"
                required={false}
              />

              <div>
                <Label>Notes</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full min-h-[88px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Scope, referral details, conversation notes..."
                />
              </div>

              {sheetMode === 'edit' && (
                <div>
                  <Label className="mb-2 block">Activity</Label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        value={activityNote}
                        onChange={(e) => setActivityNote(e.target.value)}
                        placeholder="Add a note..."
                      />
                      <Button type="button" variant="outline" onClick={handleAddNote}>
                        Add
                      </Button>
                    </div>
                    {activities.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {activities.map((activity) => (
                          <li key={activity.id} className="rounded-md border px-3 py-2">
                            <div className="text-xs text-muted-foreground">
                              {new Date(activity.created_at).toLocaleString()}
                              {activity.creator_name ? ` · ${activity.creator_name}` : ''}
                            </div>
                            <div className="mt-0.5">{activity.body}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No activity yet.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <SheetFooter className="px-6 py-4 border-t shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3 w-full">
              <div className="flex flex-wrap gap-2">
                {sheetMode === 'edit' && selectedLead && (
                  <>
                    {selectedLead.status === 'archived' ? (
                      <Button variant="outline" size="sm" onClick={handleRestore}>
                        <RotateCcw className="size-4" />
                        Restore
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={handleArchive}>
                        <Archive className="size-4" />
                        Archive
                      </Button>
                    )}
                    {!selectedLead.converted_client_id && selectedLead.status !== 'archived' && (
                      <Button size="sm" onClick={handleConvert} disabled={isSaving}>
                        <ArrowRight className="size-4" />
                        Convert to Client
                      </Button>
                    )}
                    {selectedLead.converted_client_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(`/dashboard/clients/${selectedLead.converted_client_id}`)
                        }
                      >
                        View Client
                      </Button>
                    )}
                  </>
                )}
              </div>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => setSheetOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : sheetMode === 'create' ? 'Create Lead' : 'Save'}
                </Button>
              </div>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}