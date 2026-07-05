'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, Settings } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import {
  adminUpsertCompanyAction,
  getCompanyLogoDisplayUrlAction,
  getDashboardData,
} from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import {
  PLATFORM_PLANS,
  getSubscriptionDisplayLabel,
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { maskPromoCode } from '@/lib/platform-promo'

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

const SUBSCRIPTION_PLAN_OPTIONS: { value: PlatformPlanId; label: string }[] = [
  { value: 'trial', label: PLATFORM_PLANS.trial.label },
  { value: 'basic', label: PLATFORM_PLANS.basic.label },
  { value: 'pro', label: PLATFORM_PLANS.pro.label },
]

const SUBSCRIPTION_STATUS_OPTIONS: { value: PlatformSubscriptionStatus; label: string }[] = [
  { value: 'trialing', label: 'Trialing' },
  { value: 'trial_expired', label: 'Trial ended' },
  { value: 'active', label: 'Active' },
  { value: 'past_due', label: 'Past due' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'incomplete', label: 'Incomplete' },
]

const FILTER_LABELS = [
  'All',
  'Free Trial',
  'Trial ended',
  'Basic',
  'Pro',
  'Canceled',
] as const

const DEFAULT_COMPANY_FORM = {
  name: '',
  address: '',
  phone: '',
  subscriptionPlan: 'trial' as PlatformPlanId,
  subscriptionStatus: 'trialing' as PlatformSubscriptionStatus,
  trialEndsAt: '',
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function dateInputToIso(dateValue: string): string | null {
  if (!dateValue) return null
  const end = new Date(`${dateValue}T23:59:59`)
  return Number.isNaN(end.getTime()) ? null : end.toISOString()
}

function isBlobUrl(url: string | null | undefined): url is string {
  return Boolean(url?.startsWith('blob:'))
}

function revokeBlobUrl(url: string | null) {
  if (isBlobUrl(url)) URL.revokeObjectURL(url)
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
  const [billingMetrics, setBillingMetrics] = useState({ mrr: 0, activeSubscriptions: 0 })

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false)
  const [isSavingCompany, setIsSavingCompany] = useState(false)
  const [companyForm, setCompanyForm] = useState(DEFAULT_COMPANY_FORM)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoRemoved, setLogoRemoved] = useState(false)
  const [isResolvingLogo, setIsResolvingLogo] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)

  const resetLogoState = (preview: string | null = null) => {
    revokeBlobUrl(logoPreview)
    setLogoFile(null)
    setLogoPreview(preview)
    setLogoRemoved(false)
    setIsResolvingLogo(false)
  }

  const fetchDashboardData = async () => {
    const { companies: companiesData, totalUsers: total, billingMetrics: metrics } =
      await getDashboardData()
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
    setBillingMetrics(metrics || { mrr: 0, activeSubscriptions: 0 })
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesSubscription =
      subscriptionFilter === 'All' || company.subscription === subscriptionFilter
    return matchesSearch && matchesSubscription
  })

  const getSubscriptionBadge = (sub: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      Pro: 'default',
      Basic: 'secondary',
      'Free Trial': 'outline',
      'Trial ended': 'destructive',
      Canceled: 'destructive',
    }
    return <Badge variant={variants[sub] || 'outline'}>{sub}</Badge>
  }

  const openCreateCompanyModal = () => {
    setEditingCompany(null)
    setCompanyForm(DEFAULT_COMPANY_FORM)
    resetLogoState(null)
    setIsCompanyModalOpen(true)
  }

  const openEditCompanyModal = (company: Company) => {
    const plan = normalizePlatformPlan(company.subscription_plan)
    const status = normalizeSubscriptionStatus(company.subscription_status)
    setEditingCompany(company)
    setCompanyForm({
      name: company.name,
      address: company.address || '',
      phone: company.phone || '',
      subscriptionPlan: plan,
      subscriptionStatus: status,
      trialEndsAt: toDateInputValue(company.trial_ends_at),
    })
    resetLogoState(null)
    setIsCompanyModalOpen(true)

    if (company.logo_url) {
      setIsResolvingLogo(true)
      void getCompanyLogoDisplayUrlAction(company.logo_url).then((result) => {
        if (result.success && result.url) {
          setLogoPreview(result.url)
        }
        setIsResolvingLogo(false)
      })
    }
  }

  const handleCompanyModalChange = (open: boolean) => {
    setIsCompanyModalOpen(open)
    if (!open) {
      setEditingCompany(null)
      setCompanyForm(DEFAULT_COMPANY_FORM)
      resetLogoState(null)
    }
  }

  const handleLogoFileSelect = (file: File) => {
    revokeBlobUrl(logoPreview)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    setLogoRemoved(false)
  }

  const handleLogoRemove = () => {
    revokeBlobUrl(logoPreview)
    setLogoFile(null)
    setLogoPreview(null)
    setLogoRemoved(true)
  }

  const handlePlanChange = (plan: PlatformPlanId) => {
    setCompanyForm((current) => ({
      ...current,
      subscriptionPlan: plan,
      subscriptionStatus:
        plan === 'trial'
          ? current.subscriptionStatus === 'active' ||
            current.subscriptionStatus === 'past_due'
            ? 'trialing'
            : current.subscriptionStatus
          : plan !== current.subscriptionPlan && current.subscriptionStatus === 'trialing'
            ? 'active'
            : current.subscriptionStatus,
      trialEndsAt: plan === 'trial' && !current.trialEndsAt ? '' : current.trialEndsAt,
    }))
  }

  const handleSaveCompany = async () => {
    if (!companyForm.name.trim()) {
      alert('Company name is required')
      return
    }

    setIsSavingCompany(true)

    try {
      let logoUrl = editingCompany?.logo_url || null
      if (logoRemoved) logoUrl = null

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

      const result = await adminUpsertCompanyAction({
        id: editingCompany?.id,
        name: companyForm.name,
        address: companyForm.address,
        phone: companyForm.phone,
        logo_url: logoUrl,
        subscription_plan: companyForm.subscriptionPlan,
        subscription_status: companyForm.subscriptionStatus,
        trial_ends_at:
          companyForm.subscriptionPlan === 'trial'
            ? dateInputToIso(companyForm.trialEndsAt)
            : null,
      })

      if (!result.success) {
        alert(result.error || 'Failed to save company')
        return
      }

      await fetchDashboardData()
      handleCompanyModalChange(false)
    } catch (error: unknown) {
      console.error('Error saving company:', error)
      const message = error instanceof Error ? error.message : 'Failed to save company'
      alert(message)
    } finally {
      setIsSavingCompany(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">Company & User Management</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/settings">
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
              <Settings className="size-4" />
              Settings
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2"
          >
            <LogOut className="size-4" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </Button>
          <Button onClick={openCreateCompanyModal}>+ Add Company</Button>
        </div>
      </div>

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

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 w-full sm:w-auto">
          <Input
            placeholder="Search companies..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <select
            value={subscriptionFilter}
            onChange={(e) => setSubscriptionFilter(e.target.value)}
            className="border rounded-md px-3 text-sm bg-background"
          >
            {FILTER_LABELS.map((label) => (
              <option key={label} value={label}>
                {label === 'All' ? 'All Plans' : label}
              </option>
            ))}
          </select>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'table' | 'cards')}>
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

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
                        <p className="text-xs text-emerald-700">
                          Promo: {maskPromoCode(company.promo_code)}
                        </p>
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
                    <Badge variant={company.status === 'Active' ? 'default' : 'secondary'}>
                      {company.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(company.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/companies/${company.id}`)}
                    >
                      View Users
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditCompanyModal(company)}>
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
              <div className="flex items-start justify-between mb-4 gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{company.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {company.users} users • {new Date(company.created_at).toLocaleDateString()}
                  </p>
                </div>
                {getSubscriptionBadge(company.subscription)}
              </div>

              <div className="flex-1 mb-4 text-sm text-muted-foreground space-y-1">
                <p>
                  Seats: {company.seats_used ?? company.users}/{company.seat_limit ?? 10}
                </p>
                {company.trial_ends_at && company.subscription === 'Free Trial' && (
                  <p>Trial ends {new Date(company.trial_ends_at).toLocaleDateString()}</p>
                )}
              </div>

              <div className="flex gap-2 mt-auto pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push(`/admin/companies/${company.id}`)}
                >
                  Manage Users
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => openEditCompanyModal(company)}>
                  Edit
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isCompanyModalOpen} onOpenChange={handleCompanyModalChange}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCompany ? 'Edit Company' : 'Add New Company'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <ImageAttachmentField
              label="Company logo"
              imageSrc={logoPreview}
              imageAlt={companyForm.name ? `${companyForm.name} logo` : ''}
              fileName={logoFile?.name || (logoPreview && !logoRemoved ? 'Current logo' : null)}
              description={
                logoFile
                  ? 'New logo will be saved when you submit'
                  : editingCompany?.logo_url && !logoRemoved
                    ? 'Current company logo'
                    : undefined
              }
              isUploading={isResolvingLogo || (isSavingCompany && Boolean(logoFile))}
              onFileSelect={handleLogoFileSelect}
              onRemove={handleLogoRemove}
              idleTitle="Upload company logo"
              idleDescription="Shown in the company sidebar and documents"
              mediaClassName="!w-16 !h-16 min-w-16"
            />
            <div>
              <Label>Company Name *</Label>
              <Input
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                placeholder="Acme Plumbing LLC"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <Label>Subscription tier</Label>
                <select
                  value={companyForm.subscriptionPlan}
                  onChange={(e) => handlePlanChange(e.target.value as PlatformPlanId)}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                >
                  {SUBSCRIPTION_PLAN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Subscription status</Label>
                <select
                  value={companyForm.subscriptionStatus}
                  onChange={(e) =>
                    setCompanyForm({
                      ...companyForm,
                      subscriptionStatus: e.target.value as PlatformSubscriptionStatus,
                    })
                  }
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                >
                  {SUBSCRIPTION_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {companyForm.subscriptionPlan === 'trial' && (
              <div>
                <Label>Trial end date</Label>
                <Input
                  type="date"
                  value={companyForm.trialEndsAt}
                  onChange={(e) =>
                    setCompanyForm({ ...companyForm, trialEndsAt: e.target.value })
                  }
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave blank to start a new 14-day trial from today.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleCompanyModalChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCompany} disabled={isSavingCompany}>
              {isSavingCompany
                ? editingCompany
                  ? 'Saving...'
                  : 'Creating...'
                : editingCompany
                  ? 'Save Changes'
                  : 'Create Company'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}