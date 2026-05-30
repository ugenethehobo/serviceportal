'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Clock } from "lucide-react"
import { TrialStatusBanner } from "@/components/trial-status-banner"
import { SubscriptionStatus } from "@/components/subscription-status"
import { getSubscriptionStatusAction } from "./actions"

interface Client {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

interface ClientWithStats extends Client {
  jobCount: number
  activeJobs: number
  totalDue: number
  lastActivity: string | null
}

export default function ClientsPage() {
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', notes: '' })
  const [trialRemaining, setTrialRemaining] = useState<number | null>(null)
  const [subscriptionHealthy, setSubscriptionHealthy] = useState<boolean>(true)
  const supabase = createClient()

  const loadClients = async () => {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    // Load subscription + trial status for button control
    const subStatus = await getSubscriptionStatusAction()
    setSubscriptionHealthy(subStatus.isActive)

    const { data: { user } } = await supabase.auth.getUser()

    if (subStatus.isActive && subStatus.status === 'trialing' && user) {
      const { data: company } = await supabase
        .from('companies')
        .select('trial_clients_used, trial_clients_limit')
        .or(`owner_user_id.eq.${user.id},company_users.user_id.eq.${user.id}`)
        .limit(1)
        .single()

      const limit = company?.trial_clients_limit ?? 3
      const usedCount = company?.trial_clients_used ?? 0
      setTrialRemaining(Math.max(0, limit - usedCount))
    } else {
      setTrialRemaining(null)
    }

    if (!clientsData) {
      setLoading(false)
      return
    }

    const clientsWithStats = await Promise.all(
      clientsData.map(async (client) => {
        const { data: jobs } = await supabase
          .from('jobs')
          .select('id, status, scheduled_date, created_at')
          .eq('client_id', client.id)

        const { data: bills } = await supabase
          .from('bills')
          .select('amount, status')
          .in('job_id', jobs?.map(j => j.id) || [])

        const totalDue = bills
          ?.filter(b => b.status === 'pending')
          .reduce((sum, b) => sum + Number(b.amount), 0) || 0

        const activeJobs = jobs?.filter(j =>
          ['scheduled', 'in_progress', 'quote_sent'].includes(j.status)
        ).length || 0

        const lastActivity = jobs && jobs.length > 0
          ? jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
          : client.created_at

        return {
          ...client,
          jobCount: jobs?.length || 0,
          activeJobs,
          totalDue,
          lastActivity
        }
      })
    )

    setClients(clientsWithStats)
    setLoading(false)
  }

  useEffect(() => {
    loadClients()
  }, [])

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()

    // Use the new server action that includes trial enforcement
    const { createClientAction } = await import('./actions')
    const result = await createClientAction(formData)

    if (result.success) {
      setFormData({ name: '', email: '', phone: '', address: '', notes: '' })
      setShowAddDialog(false)
      loadClients()
    } else {
      const message = result.error || 'Failed to create client'
      alert(message)
    }
  }

  if (loading) {
    return <div className="p-4 sm:p-6 md:p-8">Loading clients...</div>
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <SubscriptionStatus />
      <TrialStatusBanner />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8 sm:mb-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-2">Your main command center</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button disabled={!subscriptionHealthy || trialRemaining === 0}>
              + Add Client
            </Button>
          </DialogTrigger>

          {!subscriptionHealthy && (
            <p className="text-xs text-destructive mt-1">
              Your subscription is not active. Please update your billing.
            </p>
          )}
          {subscriptionHealthy && trialRemaining === 0 && (
            <p className="text-xs text-destructive mt-1">
              You have reached your free client limit.
            </p>
          )}

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddClient} className="space-y-4">
              <Input placeholder="Full Name *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              <Input type="email" placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              <Input type="tel" placeholder="Phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              <Input placeholder="Address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="flex-1">Cancel</Button>
                <Button type="submit" className="flex-1">Add Client</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Client Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.length === 0 ? (
          <div className="col-span-full text-center py-20">
            <div className="text-6xl mb-4">👥</div>
            <h3 className="text-2xl font-semibold mb-2">No clients yet</h3>
            <p className="text-muted-foreground mb-6">Add your first client to get started</p>
            <Button onClick={() => setShowAddDialog(true)}>Add First Client</Button>
          </div>
        ) : (
          clients.map((client) => (
            <Card
              key={client.id}
              className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-primary/50"
              onClick={() => router.push(`/dashboard/clients/${client.id}`)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl">{client.name}</CardTitle>
                    {client.address && (
                      <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        📍 {client.address}
                      </div>
                    )}
                  </div>
                  <Badge variant={client.activeJobs > 0 ? "default" : "secondary"}>
                    {client.activeJobs} Active
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-semibold">{client.jobCount}</div>
                    <div className="text-xs text-muted-foreground">Total Jobs</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-emerald-600">${client.totalDue}</div>
                    <div className="text-xs text-muted-foreground">Due</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">{client.activeJobs}</div>
                    <div className="text-xs text-muted-foreground">In Progress</div>
                  </div>
                </div>

                <div className="pt-4 border-t text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Last active: {client.lastActivity ? new Date(client.lastActivity).toLocaleDateString() : 'Never'}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
