'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { getDashboardData } from "@/app/action"
import { AppearanceSettings } from '@/components/appearance-settings'
import {
  computePlatformMrr,
  getSubscriptionDisplayLabel,
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
} from '@/lib/platform-billing'

interface Company {
  id: string
  name: string
  address?: string
  phone?: string
  logo_url?: string
  subscription_plan?: string | null
  subscription_status?: string | null
  subscription: string
  status: string
  created_at: string
  users: number
  seats_used?: number
  seat_limit?: number | null
  trial_ends_at?: string | null
  promo_code?: string | null
}

export default function AdminDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (error) {
      console.error('Logout error:', error)
      setIsLoggingOut(false)
    }
  }

  const [companies, setCompanies] = useState<Company[]>([])
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [searchTerm, setSearchTerm] = useState('')
  const [subscriptionFilter, setSubscriptionFilter] = useState<string>('All')
  const [totalUsers, setTotalUsers] = useState(0)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newCompany, setNewCompany] = useState({ name: '', address: '', phone: '' })
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [editingCompany, setEditingCompany] = useState<Company | null>(null)

  const fetchDashboardData = async () => {
    const { companies: companiesData, totalUsers: total } = await getDashboardData()
    const normalized = (companiesData || []).map((company: Company) => {
      const plan = normalizePlatformPlan(company.subscription_plan)
      const status = normalizeSubscriptionStatus(company.subscription_status)
      return {
        ...company,
        subscription: getSubscriptionDisplayLabel(plan, status, company.promo_code),
      }
    })
    setCompanies(normalized)
    setTotalUsers(total)
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSubscription = subscriptionFilter === 'All' || company.subscription === subscriptionFilter
    return matchesSearch && matchesSubscription
  })

  const billingMetrics = computePlatformMrr(companies)

  const getSubscriptionBadge = (sub: string) => {
    const variants: Record<string, any> = {
      Pro: 'default',
      Basic: 'secondary',
      'Free Trial': 'outline',
      Canceled: 'destructive',
    }
    return <Badge variant={variants[sub] || 'outline'}>{sub}</Badge>
  }

  useEffect(() => {
      if (isAddModalOpen && editingCompany) {
        setNewCompany({
          name: editingCompany.name,
          address: editingCompany.address || '',
          phone: editingCompany.phone || '',
        })
      } else if (!isAddModalOpen) {
        // Reset form when closing
        setNewCompany({ name: '', address: '', phone: '' })
        setLogoFile(null)
        setEditingCompany(null)
      }
    }, [isAddModalOpen, editingCompany])

  const handleAddCompany = async () => {
      if (!newCompany.name.trim()) {
        alert('Company name is required')
        return
      }

      setIsCreating(true)

      try {
        let logoUrl = editingCompany?.logo_url || null

        // Only upload new logo if one was selected
        if (logoFile) {
          const fileExt = logoFile.name.split('.').pop()
          const fileName = `${Date.now()}.${fileExt}`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('company-logos')
            .upload(fileName, logoFile)

          if (uploadError) throw uploadError

          const { data: publicUrl } = supabase.storage
            .from('company-logos')
            .getPublicUrl(uploadData.path)

          logoUrl = publicUrl.publicUrl
        }

        if (editingCompany) {
          // === EDIT MODE ===
          const { error } = await supabase
            .from('companies')
            .update({
              name: newCompany.name.trim(),
              address: newCompany.address.trim() || null,
              phone: newCompany.phone.trim() || null,
              logo_url: logoUrl,
            })
            .eq('id', editingCompany.id)

          if (error) throw error
        } else {
          // === ADD MODE ===
          const { error } = await supabase.from('companies').insert({
            name: newCompany.name.trim(),
            address: newCompany.address.trim() || null,
            phone: newCompany.phone.trim() || null,
            logo_url: logoUrl,
          })

          if (error) throw error
        }

        await fetchDashboardData()
        setIsAddModalOpen(false)

      } catch (error: any) {
        console.error('Error saving company:', error)
        alert(error.message || 'Failed to save company')
      } finally {
        setIsCreating(false)
      }
    }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Company & User Management</p>
        </div>

        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </Button>

          <Button onClick={() => setIsAddModalOpen(true)}>
            + Add Company
          </Button>
        </div>

        <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
          <DialogContent className="!max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Company</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Company Logo</Label>
                <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <Label>Company Name *</Label>
                <Input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Acme Plumbing LLC" />
              </div>
              <div>
                <Label>Address</Label>
                <Input value={newCompany.address} onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })} />
              </div>
              <div>
                <Label>Phone Number</Label>
                <Input value={newCompany.phone} onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCompany} disabled={isCreating}>
                {isCreating ? "Creating..." : "Create Company"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="max-w-2xl">
        <AppearanceSettings />
      </div>

      {/* Dynamic Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Companies</div>
          <div className="text-2xl font-semibold mt-1">{companies.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Users</div>
          <div className="text-2xl font-semibold mt-1">{totalUsers}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Subscriptions</div>
          <div className="text-2xl font-semibold mt-1">{billingMetrics.activeSubscriptions}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">MRR</div>
          <div className="text-2xl font-semibold mt-1">
            ${billingMetrics.mrr.toLocaleString('en-US')}
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <Input placeholder="Search companies..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-xs" />
          <select value={subscriptionFilter} onChange={(e) => setSubscriptionFilter(e.target.value)} className="border rounded-md px-3 text-sm bg-background">
            <option value="All">All Plans</option>
            <option value="Free Trial">Free Trial</option>
            <option value="Basic">Basic</option>
            <option value="Pro">Pro</option>
            <option value="Canceled">Canceled</option>
          </select>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'cards')}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Companies View */}
      {viewMode === 'table' ? (
        <Card className="p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Seats</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCompanies.map((company) => (
                <TableRow key={company.id}>
                  <TableCell className="font-medium">{company.name}</TableCell>
                  <TableCell>{company.users}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {getSubscriptionBadge(company.subscription)}
                      {company.promo_code && (
                        <p className="text-xs text-emerald-700">Promo: {company.promo_code}</p>
                      )}
                      {company.trial_ends_at && company.subscription === 'Free Trial' && (
                        <p className="text-xs text-muted-foreground">
                          Ends {new Date(company.trial_ends_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {company.seats_used ?? company.users}/{company.seat_limit ?? 10}
                  </TableCell>
                  <TableCell>
                    <Badge variant={company.status === 'Active' ? 'default' : 'secondary'}>{company.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(company.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => router.push(`/admin/companies/${company.id}`)}>
                      View Users
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingCompany(company)
                        setIsAddModalOpen(true)
                      }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCompanies.map((company) => (
            <Card key={company.id} className="p-5 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{company.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {company.users} users • {new Date(company.created_at).toLocaleDateString()}
                  </p>
                </div>
                {getSubscriptionBadge(company.subscription)}
              </div>

              <div className="flex-1 mb-4">
                <div className="text-sm font-medium mb-2 text-muted-foreground">Users</div>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground italic">User list will appear here</div>
                </div>
              </div>

              <div className="flex gap-2 mt-auto pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={() => router.push(`/admin/companies/${company.id}`)}>
                  Manage Users
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => {
                    setEditingCompany(company)
                    setIsAddModalOpen(true)
                  }}
                >
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Company Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="!max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingCompany ? 'Edit Company' : 'Add New Company'}
          </DialogTitle>
        </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Company Logo</Label>
              <Input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <Label>Company Name *</Label>
              <Input value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} placeholder="Acme Plumbing LLC" />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={newCompany.address} onChange={(e) => setNewCompany({ ...newCompany, address: e.target.value })} />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input value={newCompany.phone} onChange={(e) => setNewCompany({ ...newCompany, phone: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCompany} disabled={isCreating}>
              {isCreating
                ? (editingCompany ? "Saving..." : "Creating...")
                : (editingCompany ? "Save Changes" : "Create Company")
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
