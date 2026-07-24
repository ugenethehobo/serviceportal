'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Archive,
  ArrowRight,
  LayoutGrid,
  List,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import {
  MOBILE_FULL_WIDTH_BUTTON_CLASS,
  MOBILE_LIST_STACK_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
  MOBILE_TAB_LIST_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
  MOBILE_TOOLBAR_ROW_CLASS,
  SCROLLABLE_MODAL_BODY_CLASS,
  SCROLLABLE_MODAL_HEADER_CLASS,
  SCROLLABLE_MODAL_SHELL_LG,
} from '@/lib/mobile-layout'
import {
  archiveLeadAction,
  convertLeadToClientAction,
  createLeadAction,
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
import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Textarea } from '@/components/ui/textarea'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

export function LeadsPageClient({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const openedLeadFromUrlRef = useRef<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>(initialLeads)
  const [isLoading, setIsLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [showArchived, setShowArchived] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm())
  const [leadAddress, setLeadAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
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
    if (showArchived) {
      void fetchLeads()
    }
  }, [showArchived, fetchLeads])

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

  const openCreateDialog = () => {
    setDialogMode('create')
    setSelectedLead(null)
    setForm(emptyLeadForm())
    setLeadAddress(emptyStructuredAddress())
    setAddressErrors({})
    setDialogOpen(true)
  }

  const openEditDialog = (lead: Lead) => {
    setDialogMode('edit')
    setSelectedLead(lead)
    setForm(leadToForm(lead))
    setLeadAddress(structuredAddressFromRow(lead))
    setAddressErrors({})
    setDialogOpen(true)
  }

  const clearLeadDeepLinkFromUrl = useCallback(() => {
    if (!searchParams.get('lead')) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('lead')
    const query = params.toString()
    router.replace(query ? `/dashboard/leads?${query}` : '/dashboard/leads', { scroll: false })
  }, [router, searchParams])

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      setDialogOpen(nextOpen)
      if (!nextOpen) {
        clearLeadDeepLinkFromUrl()
      }
    },
    [clearLeadDeepLinkFromUrl]
  )

  useEffect(() => {
    const leadId = searchParams.get('lead')
    if (!leadId) {
      openedLeadFromUrlRef.current = null
      return
    }
    if (openedLeadFromUrlRef.current === leadId) return

    const lead = leads.find((item) => item.id === leadId)
    if (!lead) return

    openedLeadFromUrlRef.current = leadId
    openEditDialog(lead)
  }, [searchParams, leads])

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
      dialogMode === 'create'
        ? await createLeadAction(payload)
        : await updateLeadAction({ id: selectedLead!.id, ...payload })

    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    toast.success(dialogMode === 'create' ? 'Lead created' : 'Lead updated')
    handleDialogOpenChange(false)
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
    handleDialogOpenChange(false)
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
    handleDialogOpenChange(false)
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
    handleDialogOpenChange(false)
    router.push(`/dashboard/clients/${result.clientId}`)
  }

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <div className="flex shrink-0 items-start justify-between gap-4 max-md:flex-col max-md:items-stretch">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight max-md:text-2xl">Leads</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Track prospects, follow up on time, and convert them to clients
          </p>
        </div>
        <Button onClick={openCreateDialog} className="max-md:w-full max-md:min-h-11">
          <Plus className="size-4" />
          Add Lead
        </Button>
      </div>

      <MainPageCard className="overflow-hidden p-4 sm:p-6">
        <div className="mb-5 flex shrink-0 flex-col items-start justify-between gap-4 sm:mb-6 lg:flex-row lg:items-center">
          <div className={MOBILE_TOOLBAR_ROW_CLASS}>
            <Input
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs max-md:max-w-none max-md:flex-1"
            />

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter((value ?? 'all') as 'all' | LeadStatus)}
            >
              <SelectTrigger className={`w-[160px] ${MOBILE_SELECT_TRIGGER_CLASS}`}>
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
            <TabsList className={MOBILE_TAB_LIST_CLASS}>
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
            <div className={`rounded-lg border overflow-hidden ${MOBILE_TABLE_DESKTOP_ONLY_CLASS}`}>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="px-4">Lead</TableHead>
                    <TableHead className="px-4">Follow-up</TableHead>
                    <TableHead className="px-4">Stage</TableHead>
                    <TableHead className="px-4">Source</TableHead>
                    <TableHead className="px-4 text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      onClick={() => openEditDialog(lead)}
                      className="cursor-pointer"
                    >
                      <TableCell className="px-4 py-3">
                        <div className="font-medium">{lead.name}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {[lead.contact_name, lead.email, lead.phone].filter(Boolean).join(' · ') ||
                            'No contact details'}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <FollowUpBadge followUpAt={lead.follow_up_at} />
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant="outline">{LEAD_STATUS_LABELS[lead.status]}</Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {LEAD_SOURCE_LABELS[lead.source]}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right font-medium">
                        {lead.estimated_value != null && lead.estimated_value > 0
                          ? `$${lead.estimated_value.toLocaleString()}`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className={MOBILE_LIST_STACK_CLASS}>
              {filteredLeads.map((lead) => (
                <MobileListCard key={lead.id} onClick={() => openEditDialog(lead)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{lead.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {[lead.contact_name, lead.email, lead.phone].filter(Boolean).join(' · ') ||
                          'No contact details'}
                      </p>
                    </div>
                    <Badge variant="outline">{LEAD_STATUS_LABELS[lead.status]}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    <MobileListCardRow label="Follow-up" value={<FollowUpBadge followUpAt={lead.follow_up_at} />} />
                    <MobileListCardRow label="Source" value={LEAD_SOURCE_LABELS[lead.source]} />
                    <MobileListCardRow
                      label="Value"
                      value={
                        lead.estimated_value != null && lead.estimated_value > 0
                          ? `$${lead.estimated_value.toLocaleString()}`
                          : '—'
                      }
                    />
                  </div>
                </MobileListCard>
              ))}
            </div>
          </MainPageCardScroll>
        ) : (
          <MainPageCardScroll contentClassName="min-w-0">
            <div className="grid grid-cols-1 gap-4 pb-2 xl:grid-cols-5 xl:min-w-[960px]">
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
                        onOpen={openEditDialog}
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className={SCROLLABLE_MODAL_SHELL_LG}>
          <DialogHeader
            className={`border-b px-6 pt-5 pb-4 ${SCROLLABLE_MODAL_HEADER_CLASS}`}
          >
            <DialogTitle>
              {dialogMode === 'create' ? 'New Lead' : selectedLead?.name || 'Lead'}
            </DialogTitle>
          </DialogHeader>

          <div className={SCROLLABLE_MODAL_BODY_CLASS}>
            <div className="space-y-5 px-4 py-5 max-md:px-4 sm:px-6">
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
                <DateTimePicker
                  value={form.follow_up_at}
                  onChange={(value) => setForm({ ...form, follow_up_at: value })}
                  placeholder="Schedule follow-up"
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
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 min-h-[88px]"
                  placeholder="Scope, referral details, conversation notes..."
                />
              </div>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 border-t px-4 py-4 max-md:px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap gap-2 max-md:w-full">
                {dialogMode === 'edit' && selectedLead && (
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
              <div className="flex gap-2 max-md:w-full sm:ml-auto">
                <Button
                  variant="outline"
                  className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                  onClick={() => handleDialogOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : dialogMode === 'create' ? 'Create Lead' : 'Save'}
                </Button>
              </div>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}