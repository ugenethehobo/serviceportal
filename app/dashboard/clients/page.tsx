'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"

import { createClientAction, updateClientAction } from "@/app/action"

interface Client {
  id: string
  name: string
  contact_name?: string
  email?: string
  phone?: string
  address?: string
  status: 'active' | 'archived'
  created_at: string

  jobsInProgress?: number
  nextJobDate?: string
  amountDue?: number
}

export default function ClientsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
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
    address: '',
    notes: '',
  })
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list')
  const [isLoading, setIsLoading] = useState(true)

  const fetchClients = async () => {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching clients:', error)
      return
    }

    const clientIds = (data || []).map((c) => c.id)
    const statsMap: Record<string, { jobsInProgress: number; nextJobDate?: string; amountDue: number }> = {}

    if (clientIds.length > 0) {
      const now = new Date().toISOString()
      const { data: schedules } = await supabase
        .from('schedules')
        .select('client_id, status, start_time, price')
        .in('client_id', clientIds)
        .in('status', ['scheduled', 'in_progress'])

      if (schedules) {
        for (const schedule of schedules) {
          if (!statsMap[schedule.client_id]) {
            statsMap[schedule.client_id] = { jobsInProgress: 0, amountDue: 0 }
          }
          const stats = statsMap[schedule.client_id]

          if (schedule.status === 'in_progress') {
            stats.jobsInProgress++
          }

          if (schedule.status === 'scheduled' || schedule.status === 'in_progress') {
            stats.amountDue += schedule.price || 0
          }

          if (schedule.status === 'scheduled' && schedule.start_time > now) {
            if (!stats.nextJobDate || schedule.start_time < stats.nextJobDate) {
              stats.nextJobDate = schedule.start_time
            }
          }
        }
      }
    }

    const clientsWithStats = (data || []).map((client) => ({
      ...client,
      jobsInProgress: statsMap[client.id]?.jobsInProgress ?? 0,
      nextJobDate: statsMap[client.id]?.nextJobDate,
      amountDue: statsMap[client.id]?.amountDue ?? 0,
    }))

    setIsLoading(false)
    setClients(clientsWithStats)
  }

  const handleSaveClient = async () => {
    if (!newClient.name.trim()) {
      alert('Client name is required')
      return
    }

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
      // Update existing client
      result = await updateClientAction({
        id: editingClient.id,
        name: newClient.name.trim(),
        email: newClient.email.trim() || undefined,
        phone: newClient.phone.trim() || undefined,
        address: newClient.address.trim() || undefined,
        notes: newClient.notes.trim() || undefined,
      })
    } else {
      // Create new client
      result = await createClientAction({
        name: newClient.name.trim(),
        email: newClient.email.trim() || undefined,
        phone: newClient.phone.trim() || undefined,
        address: newClient.address.trim() || undefined,
        notes: newClient.notes.trim() || undefined,
        companyId: profile!.company_id,
      })
    }

    if (result.success) {
      setNewClient({ name: '', email: '', phone: '', address: '', notes: '' })
      setEditingClient(null)
      setIsAddModalOpen(false)
      await fetchClients()
    } else {
      alert(result.error || 'Failed to save client')
    }

    setIsCreatingClient(false)
  }

const openEditClient = (client: Client) => {
  setEditingClient(client)
  setNewClient({
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    notes: '', // You can fetch notes if stored separately
  })
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

  useEffect(() => {
    fetchClients()
  }, [])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground">Manage your client relationships</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>+ Add Client</Button>
      </div>

      {/* Main Content Card */}
      <Card className="p-6 flex flex-col h-[calc(100vh-8rem)]">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
          <div className="flex gap-4 items-center w-full sm:w-auto">
            <Input
              placeholder="Search clients..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs"
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
            <TabsList>
              <TabsTrigger value="list">List</TabsTrigger>
              <TabsTrigger value="cards">Cards</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="scroll-fade flex-1 overflow-auto">
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
              // List View
              <div className="border rounded-lg">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium">Client</th>
                      <th className="text-left p-4 font-medium">Phone</th>
                      <th className="text-left p-4 font-medium">Jobs</th>
                      <th className="text-left p-4 font-medium">Next Job</th>
                      <th className="text-left p-4 font-medium">Due</th>
                      <th className="text-left p-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredClients.length > 0 ? (
                      filteredClients.map((client) => (
                        <tr
                        key={client.id}
                        onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                        className="border-b hover:bg-muted/30 cursor-pointer"
                      >
                        <td className="p-4 font-medium">{client.name}</td>
                        <td className="p-4 text-muted-foreground">{client.phone || '-'}</td>
                        <td className="p-4">
                          <Badge variant="outline">
                            {client.jobsInProgress ?? 0} in progress
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {client.nextJobDate
                            ? new Date(client.nextJobDate).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="p-4 font-medium">
                          {client.amountDue
                            ? `$${client.amountDue.toFixed(2)}`
                            : '—'}
                        </td>
                        <td className="p-4">
                          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                            {client.status}
                          </Badge>
                        </td>
                      </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No clients found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                          <div className="font-medium">{client.jobsInProgress ?? 0} in progress</div>
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
                        <Button variant="outline" size="sm" className="flex-1">View</Button>
                        {/* Edit button removed */}
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
        </div>
      </Card>

      {/* Add / Edit Client Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={(open) => {
        if (!open) {
          setEditingClient(null)
          setNewClient({ name: '', email: '', phone: '', address: '', notes: '' })
        }
        setIsAddModalOpen(open)
      }}>
        <DialogContent className="!max-w-md">
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

            <div className="grid grid-cols-2 gap-4">
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
              <Label>Address</Label>
              <Input
                value={newClient.address}
                onChange={(e) => setNewClient({ ...newClient, address: e.target.value })}
                placeholder="123 Main St, City, State"
              />
            </div>

            <div>
              <Label>Notes</Label>
              <textarea
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                placeholder="Any additional notes about this client..."
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
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
    </div>
  )
}
