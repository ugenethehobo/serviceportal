'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScrollArea } from "@/components/ui/scroll-area"
import { MobileListCard, MobileListCardRow } from '@/components/ui/mobile-list-card'
import {
  MOBILE_LIST_STACK_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
  MOBILE_TAB_LIST_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
  MOBILE_TOOLBAR_ROW_CLASS,
} from '@/lib/mobile-layout'

import {
  archiveClientAction,
  createClientAction,
  getClientsListAction,
  restoreClientAction,
  updateClientAction,
} from "@/app/action"
import { toast } from 'sonner'

import { StructuredAddressForm } from '@/components/dashboard/company-address-form'
import {
  emptyStructuredAddress,
  normalizeStructuredAddress,
  structuredAddressFromClientRow,
  validateStructuredAddressIfPresent,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'

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

  jobsInProgress?: number
  nextJobDate?: string
  amountDue?: number
}

export function ClientsPageClient({ initialClients }: { initialClients: Client[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>(initialClients)
  const [filteredClients, setFilteredClients] = useState<Client[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [isCreatingClient, setIsCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  })
  const [clientAddress, setClientAddress] = useState<StructuredAddress>(emptyStructuredAddress())
  const [addressErrors, setAddressErrors] = useState<StructuredAddressErrors>({})
  const [legacyClientAddress, setLegacyClientAddress] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [isLoading, setIsLoading] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Client | null>(null)
  const [statusAction, setStatusAction] = useState<'archive' | 'restore' | null>(null)
  const [isStatusLoading, setIsStatusLoading] = useState(false)

  const fetchClients = async () => {
    setIsLoading(true)
    const result = await getClientsListAction()
    if (result.success) {
      setClients(result.data)
    } else {
      console.error('Error fetching clients:', result.error)
    }
    setIsLoading(false)
  }

  const handleSaveClient = async () => {
    if (!newClient.name.trim()) {
      toast.error('Client name is required')
      return
    }

    const normalizedAddress = normalizeStructuredAddress(clientAddress)
    const addressValidation = validateStructuredAddressIfPresent(normalizedAddress)
    if (!addressValidation.valid) {
      setAddressErrors(addressValidation.errors)
      return
    }
    setAddressErrors({})

    setIsCreatingClient(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    let result

    if (editingClient) {
      result = await updateClientAction({
        id: editingClient.id,
        name: newClient.name.trim(),
        email: newClient.email.trim() || undefined,
        phone: newClient.phone.trim() || undefined,
        clientAddress: normalizedAddress,
        notes: newClient.notes.trim() || undefined,
      })
    } else {
      result = await createClientAction({
        name: newClient.name.trim(),
        email: newClient.email.trim() || undefined,
        phone: newClient.phone.trim() || undefined,
        clientAddress: normalizedAddress,
        notes: newClient.notes.trim() || undefined,
        companyId: profile!.company_id,
      })
    }

    if (result.success) {
      setNewClient({ name: '', email: '', phone: '', notes: '' })
      setClientAddress(emptyStructuredAddress())
      setLegacyClientAddress(null)
      setEditingClient(null)
      setIsAddModalOpen(false)
      await fetchClients()
    } else {
      toast.error(result.error || 'Failed to save client')
    }

    setIsCreatingClient(false)
  }

  const openStatusConfirm = (
    client: Client,
    action: 'archive' | 'restore',
    event: React.MouseEvent
  ) => {
    event.stopPropagation()
    setStatusTarget(client)
    setStatusAction(action)
  }

  const handleClientStatusChange = async () => {
    if (!statusTarget || !statusAction) return
    setIsStatusLoading(true)

    const result =
      statusAction === 'archive'
        ? await archiveClientAction(statusTarget.id)
        : await restoreClientAction(statusTarget.id)

    if (result.success) {
      toast.success(
        statusAction === 'archive' ? 'Client archived' : 'Client restored'
      )
      setStatusTarget(null)
      setStatusAction(null)
      await fetchClients()
    } else {
      toast.error(result.error || 'Action failed')
    }

    setIsStatusLoading(false)
  }

const openEditClient = (client: Client) => {
  setEditingClient(client)
  const structured = structuredAddressFromClientRow(client)
  setNewClient({
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    notes: client.notes || '',
  })
  setClientAddress(structured.street ? structured : emptyStructuredAddress())
  setLegacyClientAddress(structured.street ? null : client.address?.trim() || null)
  setAddressErrors({})
  setIsAddModalOpen(true)
}

  // Filter clients based on search and archived toggle
  useEffect(() => {
    let result = [...clients]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(client =>
        client.name.toLowerCase().includes(term) ||
        client.contact_name?.toLowerCase().includes(term) ||
        client.email?.toLowerCase().includes(term) ||
        client.phone?.toLowerCase().includes(term)
      )
    }

    // Archived filter
    if (!showArchived) {
      result = result.filter(client => client.status === 'active')
    }

    setFilteredClients(result)
  }, [clients, searchTerm, showArchived])

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <div className="flex items-center justify-between mb-6 shrink-0 max-md:mb-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight max-md:text-2xl">Clients</h1>
          <p className="text-muted-foreground">Manage your client relationships</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="max-md:w-full max-md:min-h-11">
          + Add Client
        </Button>
      </div>

      {/* Main Content Card */}
      <MainPageCard className="p-6">
        {/* Controls */}
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className={MOBILE_TOOLBAR_ROW_CLASS}>
            <Input
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs max-md:max-w-none max-md:flex-1"
            />

            <div className="flex items-center gap-2">
              <Switch
                id="archived"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <Label htmlFor="archived" className="text-sm">Show Archived</Label>
            </div>
          </div>

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'cards')}>
            <TabsList className={MOBILE_TAB_LIST_CLASS}>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="cards">Cards</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <MainPageCardScroll>
          {isLoading ? (
            // Loading Skeletons
            viewMode === 'list' ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between border rounded-lg p-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-3 w-[150px]" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-5 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ))}
              </div>
            )
          ) : (
            // Actual Content (List or Cards)
            viewMode === 'list' ? (
              <>
              <div className={`rounded-lg border ${MOBILE_TABLE_DESKTOP_ONLY_CLASS}`}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="px-4">Client</TableHead>
                      <TableHead className="px-4">Phone</TableHead>
                      <TableHead className="px-4">Jobs</TableHead>
                      <TableHead className="px-4">Next Job</TableHead>
                      <TableHead className="px-4">Due</TableHead>
                      <TableHead className="px-4">Status</TableHead>
                      <TableHead className="px-4 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => (
                        <TableRow
                          key={client.id}
                          onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                          className="cursor-pointer"
                        >
                          <TableCell className="px-4 font-medium">{client.name}</TableCell>
                          <TableCell className="px-4 text-muted-foreground">{client.phone || '-'}</TableCell>
                          <TableCell className="px-4">
                            <Badge variant="outline">
                              {client.jobsInProgress ?? 0} active
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 text-sm text-muted-foreground">
                            {client.nextJobDate
                              ? new Date(client.nextJobDate).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell className="px-4 font-medium">
                            {client.amountDue
                              ? `$${client.amountDue.toFixed(2)}`
                              : '—'}
                          </TableCell>
                          <TableCell className="px-4">
                            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                              {client.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 text-right">
                            {client.status === 'active' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) => openStatusConfirm(client, 'archive', event)}
                              >
                                Archive
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(event) => openStatusConfirm(client, 'restore', event)}
                              >
                                Restore
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                          No clients found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className={MOBILE_LIST_STACK_CLASS}>
                {filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
                    <MobileListCard
                      key={client.id}
                      onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{client.name}</h3>
                          <p className="text-sm text-muted-foreground">{client.phone || 'No phone'}</p>
                        </div>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        <MobileListCardRow
                          label="Jobs"
                          value={`${client.jobsInProgress ?? 0} active`}
                        />
                        <MobileListCardRow
                          label="Next job"
                          value={
                            client.nextJobDate
                              ? new Date(client.nextJobDate).toLocaleDateString()
                              : '—'
                          }
                        />
                        <MobileListCardRow
                          label="Due"
                          value={
                            client.amountDue ? `$${client.amountDue.toFixed(2)}` : '—'
                          }
                        />
                      </div>
                      <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {client.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="max-md:min-h-11"
                            onClick={(event) => openStatusConfirm(client, 'archive', event)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="max-md:min-h-11"
                            onClick={(event) => openStatusConfirm(client, 'restore', event)}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </MobileListCard>
                  ))
                ) : (
                  <p className="py-8 text-center text-muted-foreground">No clients found.</p>
                )}
              </div>
              </>
            ) : (
              // Card View
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
                    <Card
                      key={client.id}
                      onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                      className="p-5 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">{client.name}</h3>
                          <p className="text-sm text-muted-foreground">{client.contact_name}</p>
                        </div>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status}
                        </Badge>
                      </div>

                      {/* Stats Section */}
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground text-xs">Jobs</div>
                          <div className="font-medium">{client.jobsInProgress ?? 0} active</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Next Job</div>
                          <div className="font-medium">
                            {client.nextJobDate
                              ? new Date(client.nextJobDate).toLocaleDateString()
                              : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-xs">Amount Due</div>
                          <div className="font-medium text-orange-600">
                            {client.amountDue ? `$${client.amountDue.toFixed(2)}` : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                        >
                          View
                        </Button>
                        {client.status === 'active' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => openStatusConfirm(client, 'archive', event)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(event) => openStatusConfirm(client, 'restore', event)}
                          >
                            Restore
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full text-center py-12 text-muted-foreground">
                    No clients found.
                  </div>
                )}
              </div>
            )
          )}
        </MainPageCardScroll>
      </MainPageCard>

      {/* Add / Edit Client Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingClient(null)
          setNewClient({ name: '', email: '', phone: '', notes: '' })
          setClientAddress(emptyStructuredAddress())
          setLegacyClientAddress(null)
          setAddressErrors({})
        }
        setIsAddModalOpen(open)
      }}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingClient ? 'Edit Client' : 'Add New Client'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Client Name *</Label>
              <Input
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                placeholder="Acme Plumbing LLC"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 max-md:grid-cols-1 sm:grid-cols-2">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  placeholder="contact@acme.com"
                />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>

            <div>
              {legacyClientAddress && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 mb-3">
                  Saved address from the previous format:{' '}
                  <span className="font-medium">{legacyClientAddress}</span>.
                  Re-enter it using the fields below.
                </div>
              )}
              <StructuredAddressForm
                value={clientAddress}
                onChange={(value) => {
                  setClientAddress(value)
                  if (Object.keys(addressErrors).length > 0) {
                    setAddressErrors({})
                  }
                }}
                errors={addressErrors}
                idPrefix="client-modal"
                required={false}
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                placeholder="Any additional notes about this client..."
                className="min-h-[80px]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveClient}
              disabled={isCreatingClient || !newClient.name.trim()}
            >
              {isCreatingClient
                ? (editingClient ? 'Saving...' : 'Creating...')
                : (editingClient ? 'Save Changes' : 'Add Client')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!statusTarget && !!statusAction}
        onOpenChange={(open) => {
          if (!open) {
            setStatusTarget(null)
            setStatusAction(null)
          }
        }}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusAction === 'archive' ? 'Archive Client' : 'Restore Client'}
            </DialogTitle>
            <DialogDescription>
              {statusAction === 'archive'
                ? `Archive ${statusTarget?.name}? They will be hidden from the default clients list.`
                : `Restore ${statusTarget?.name}? They will appear in the active clients list again.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStatusTarget(null)
                setStatusAction(null)
              }}
            >
              Back
            </Button>
            <Button onClick={handleClientStatusChange} disabled={isStatusLoading}>
              {isStatusLoading
                ? 'Processing...'
                : statusAction === 'archive'
                  ? 'Archive Client'
                  : 'Restore Client'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
