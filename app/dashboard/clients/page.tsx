'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [portalLink, setPortalLink] = useState('')
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', notes: ''
  })

  const supabase = createClient()

  const loadClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error) setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('clients').insert([{ ...formData, user_id: user.id }])
    if (!error) {
      setFormData({ name: '', email: '', phone: '', address: '', notes: '' })
      setShowAddDialog(false)
      loadClients()
    }
  }

  const handleEditClient = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) return

    const { error } = await supabase.from('clients').update(formData).eq('id', selectedClient.id)
    if (!error) {
      setShowEditDialog(false)
      setSelectedClient(null)
      loadClients()
    }
  }

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm('Are you sure you want to delete this client?')) return
    const { error } = await supabase.from('clients').delete().eq('id', clientId)
    if (!error) loadClients()
  }

  const openEditModal = (client: Client) => {
    setSelectedClient(client)
    setFormData({
      name: client.name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || ''
    })
    setShowEditDialog(true)
  }

  const openViewModal = (client: Client) => {
    setSelectedClient(client)
    setPortalLink('')
    setShowViewDialog(true)
  }

  const generatePortalLink = () => {
    if (!selectedClient) return
    const link = `${window.location.origin}/portal/${selectedClient.id}`
    setPortalLink(link)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">Manage your client relationships</p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>+ Add Client</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddClient} className="space-y-4">
              <Input
                placeholder="Full Name *"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
              <Input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
              <Input
                type="tel"
                placeholder="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
              />
              <Input
                placeholder="Address"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
              <Textarea
                placeholder="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
              />
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">Add Client</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">👥</div>
              <h3 className="text-xl font-semibold mb-2">No clients yet</h3>
              <p className="text-muted-foreground mb-6">Add your first client to get started</p>
              <Button onClick={() => setShowAddDialog(true)}>Add Your First Client</Button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Phone</th>
                  <th className="w-40 px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map((client) => (
                  <tr key={client.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4 font-medium">{client.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{client.email || '—'}</td>
                    <td className="px-6 py-4 text-muted-foreground">{client.phone || '—'}</td>
                    <td className="px-6 py-4 flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openViewModal(client)}>
                        View
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(client)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClient(client.id)} className="text-destructive hover:text-destructive">
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* View Client Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedClient?.name}</DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Email</div>
                <div>{selectedClient.email || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Phone</div>
                <div>{selectedClient.phone || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Address</div>
                <div>{selectedClient.address || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Notes</div>
                <div>{selectedClient.notes || '—'}</div>
              </div>

              <div className="pt-4 border-t">
                <Button onClick={generatePortalLink} className="w-full mb-4">
                  Generate Portal Link
                </Button>

                {portalLink && (
                  <div className="bg-muted p-4 rounded-xl">
                    <div className="text-sm text-muted-foreground mb-2">Client Portal Link:</div>
                    <div className="font-mono text-sm break-all bg-background p-3 rounded-lg border">{portalLink}</div>
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => navigator.clipboard.writeText(portalLink)}
                      className="mt-2 p-0 h-auto"
                    >
                      Copy Link
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
