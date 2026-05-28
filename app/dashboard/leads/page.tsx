'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { UserPlus, Clock, ArrowUpDown, Search, Edit2, Trash2, UserCheck } from "lucide-react"
import { TrialStatusBanner } from "@/components/trial-status-banner"
import { SubscriptionStatus } from "@/components/subscription-status"

interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
}

interface CompanyThresholds {
  lead_fresh_days: number
  lead_stale_days: number
}

type SortMode = 'newest' | 'oldest'

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingLead, setEditingLead] = useState<Lead | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [thresholds, setThresholds] = useState<CompanyThresholds>({ lead_fresh_days: 7, lead_stale_days: 30 })

  const [confirmDialog, setConfirmDialog] = useState<any>({ open: false })

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    notes: ''
  })

  const supabase = createClient()

  const loadThresholds = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: settings } = await supabase
      .from('company_settings')
      .select('lead_fresh_days, lead_stale_days')
      .eq('user_id', user.id)
      .single()

    if (settings) {
      setThresholds({
        lead_fresh_days: settings.lead_fresh_days ?? 7,
        lead_stale_days: settings.lead_stale_days ?? 30,
      })
    }
  }

  const loadLeads = async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: sortMode === 'oldest' })

    if (data) setLeads(data)
    setLoading(false)
  }

  useEffect(() => {
    loadThresholds()
    loadLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload when sort changes
  useEffect(() => {
    if (!loading) {
      loadLeads()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode])

  const getLeadAgeInfo = (createdAt: string) => {
    const created = new Date(createdAt)
    const now = new Date()
    const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))

    const { lead_fresh_days, lead_stale_days } = thresholds

    if (ageDays < lead_fresh_days) {
      return {
        ageDays,
        label: 'Fresh',
        color: 'green',
        badgeClass: 'bg-green-600 text-white',
        cardClass: 'border-green-500 bg-green-50/30 dark:bg-green-950/20',
      }
    } else if (ageDays < lead_stale_days) {
      return {
        ageDays,
        label: 'Aging',
        color: 'yellow',
        badgeClass: 'bg-amber-500 text-white',
        cardClass: 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20',
      }
    } else {
      return {
        ageDays,
        label: 'Stale',
        color: 'red',
        badgeClass: 'bg-red-600 text-white',
        cardClass: 'border-red-500 bg-red-50/30 dark:bg-red-950/20',
      }
    }
  }

  const filteredLeads = leads
    .filter((lead) => {
      const term = searchTerm.toLowerCase()
      return (
        lead.name.toLowerCase().includes(term) ||
        (lead.email && lead.email.toLowerCase().includes(term)) ||
        (lead.notes && lead.notes.toLowerCase().includes(term))
      )
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return sortMode === 'newest' ? dateB - dateA : dateA - dateB
    })

  const freshCount = leads.filter(l => getLeadAgeInfo(l.created_at).label === 'Fresh').length
  const agingCount = leads.filter(l => getLeadAgeInfo(l.created_at).label === 'Aging').length
  const staleCount = leads.filter(l => getLeadAgeInfo(l.created_at).label === 'Stale').length

  const resetForm = () => {
    setFormData({ name: '', email: '', phone: '', address: '', notes: '' })
    setEditingLead(null)
  }

  const openEdit = (lead: Lead) => {
    setEditingLead(lead)
    setFormData({
      name: lead.name,
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      notes: lead.notes || '',
    })
    setShowEditDialog(true)
  }

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !formData.name.trim()) return

    const { error } = await supabase.from('leads').insert([{
      ...formData,
      user_id: user.id,
    }])

    if (!error) {
      resetForm()
      setShowAddDialog(false)
      await loadLeads()
    } else {
      setConfirmDialog({
        open: true,
        title: "Error",
        description: 'Failed to add lead: ' + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    }
  }

  const handleUpdateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLead || !formData.name.trim()) return

    const { error } = await supabase
      .from('leads')
      .update({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        notes: formData.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingLead.id)

    if (!error) {
      resetForm()
      setShowEditDialog(false)
      await loadLeads()
    } else {
      setConfirmDialog({
        open: true,
        title: "Error",
        description: 'Failed to update lead: ' + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    }
  }

  const handleDeleteLead = async (leadId: string, leadName: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Lead?",
      description: `Delete lead "${leadName}"? This cannot be undone.`,
      confirmLabel: "Delete Lead",
      destructive: true,
      onConfirm: async () => {
        setConfirmDialog({ open: false })
        const { error } = await supabase.from('leads').delete().eq('id', leadId)
        if (!error) {
          await loadLeads()
        } else {
          setConfirmDialog({
            open: true,
            title: "Error",
            description: 'Failed to delete lead: ' + error.message,
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog({ open: false })
          })
        }
      }
    })
  }

  const handleConvertToClient = async (lead: Lead) => {
    setConfirmDialog({
      open: true,
      title: "Convert Lead to Client?",
      description: `Convert "${lead.name}" to a client? This will create a new client record and remove the lead.`,
      confirmLabel: "Convert to Client",
      onConfirm: async () => {
        setConfirmDialog({ open: false })

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        try {
          // Use the same server action for trial enforcement
          const { createClientAction } = await import('../clients/actions')
          const result = await createClientAction({
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            address: lead.address,
            notes: lead.notes ? `Converted from lead on ${new Date().toLocaleDateString()}. Original notes: ${lead.notes}` : `Converted from lead on ${new Date().toLocaleDateString()}`,
          })

          if (!result.success) {
            throw new Error(result.error || 'Failed to convert lead')
          }

          await supabase.from('leads').delete().eq('id', lead.id)
          await loadLeads()

          setConfirmDialog({
            open: true,
            title: "Success",
            description: `"${lead.name}" has been converted to a client! You can find them in the Clients section.`,
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog({ open: false })
          })
        } catch (err: any) {
          setConfirmDialog({
            open: true,
            title: "Conversion Failed",
            description: 'Conversion failed: ' + err.message,
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog({ open: false })
          })
        }
      }
    })
  }

  const toggleSort = () => {
    setSortMode(sortMode === 'newest' ? 'oldest' : 'newest')
  }

  if (loading) {
    return <div className="p-8">Loading leads...</div>
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <SubscriptionStatus />
      <TrialStatusBanner />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground mt-2">Track potential clients before they become active customers</p>
        </div>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="lg">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Lead
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddLead} className="space-y-4">
              <Input
                placeholder="Full Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <Input
                type="tel"
                placeholder="Phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              <Input
                placeholder="Address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
              <Textarea
                placeholder="Notes / Source (e.g. Website inquiry, Referral from John, Cold call...)"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { resetForm(); setShowAddDialog(false) }} className="flex-1">Cancel</Button>
                <Button type="submit" className="flex-1">Add Lead</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-green-500/70 bg-green-50/40 dark:bg-green-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="text-3xl font-bold text-green-700 dark:text-green-400">{freshCount}</div>
            <div className="text-sm text-green-600 dark:text-green-500">Fresh Leads</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/70 bg-amber-50/40 dark:bg-amber-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">{agingCount}</div>
            <div className="text-sm text-amber-600 dark:text-amber-500">Aging Leads</div>
          </CardContent>
        </Card>
        <Card className="border-red-500/70 bg-red-50/40 dark:bg-red-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="text-3xl font-bold text-red-700 dark:text-red-400">{staleCount}</div>
            <div className="text-sm text-red-600 dark:text-red-500">Stale Leads</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center justify-center h-full">
            <div>
              <div className="text-3xl font-bold">{leads.length}</div>
              <div className="text-sm text-muted-foreground">Total Pipeline</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads by name, email, or notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <Button variant="outline" onClick={toggleSort} className="gap-2">
          <ArrowUpDown className="h-4 w-4" />
          {sortMode === 'newest' ? 'Newest first' : 'Oldest first'}
        </Button>
      </div>

      {/* Leads Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredLeads.length === 0 ? (
          <div className="col-span-full text-center py-20">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-2xl font-semibold mb-2">
              {leads.length === 0 ? "No leads yet" : "No matches"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {leads.length === 0
                ? "Add your first potential client to start tracking your pipeline"
                : "Try a different search term"}
            </p>
            {leads.length === 0 && (
              <Button onClick={() => setShowAddDialog(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Add Your First Lead
              </Button>
            )}
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const ageInfo = getLeadAgeInfo(lead.created_at)

            return (
              <Card
                key={lead.id}
                className={`hover:shadow-xl transition-all border-2 ${ageInfo.cardClass}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-2xl truncate">{lead.name}</CardTitle>
                      {lead.address && (
                        <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                          📍 {lead.address}
                        </div>
                      )}
                    </div>
                    <Badge className={ageInfo.badgeClass}>
                      {ageInfo.label} • {ageInfo.ageDays}d
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="space-y-1 text-sm">
                    {lead.email && <div className="text-muted-foreground">✉️ {lead.email}</div>}
                    {lead.phone && <div className="text-muted-foreground">📞 {lead.phone}</div>}
                  </div>

                  {lead.notes && (
                    <div className="text-sm bg-muted/50 rounded-none p-3 text-muted-foreground line-clamp-3">
                      {lead.notes}
                    </div>
                  )}

                  <div className="pt-3 border-t flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Added {new Date(lead.created_at).toLocaleDateString()}
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(lead)}
                        title="Edit lead"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteLead(lead.id, lead.name)}
                        title="Delete lead"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleConvertToClient(lead)}
                        title="Convert to client"
                      >
                        <UserCheck className="h-4 w-4" />
                        Convert
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        if (!open) { resetForm(); setShowEditDialog(false) }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateLead} className="space-y-4">
            <Input
              placeholder="Full Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <Input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
            <Input type="tel" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            <Input placeholder="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
            <Textarea
              placeholder="Notes / Source"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => { resetForm(); setShowEditDialog(false) }} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title || ""}
        description={confirmDialog.description || ""}
        confirmLabel={confirmDialog.confirmLabel || "OK"}
        onConfirm={confirmDialog.onConfirm || (() => setConfirmDialog({ open: false }))}
        destructive={confirmDialog.destructive}
      />
    </div>
  )
}
