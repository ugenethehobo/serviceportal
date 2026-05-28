'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Upload } from "lucide-react"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"

export default function SettingsPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [showConnectionSuccess, setShowConnectionSuccess] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stripeConnected, setStripeConnected] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  const [confirmDialog, setConfirmDialog] = useState<any>({ open: false })

  const [statuses, setStatuses] = useState([
    { key: "quote_sent", label: "Quote Sent", color: "#eab308" },
    { key: "scheduled", label: "Scheduled", color: "#3b82f6" },
    { key: "in_progress", label: "In Progress", color: "#8b5cf6" },
    { key: "completed", label: "Completed", color: "#22c55e" },
    { key: "invoiced", label: "Invoiced", color: "#f97316" },
    { key: "paid", label: "Paid", color: "#10b981" },
  ])

  const [form, setForm] = useState({
    company_name: '',
    company_email: '',
    company_phone: '',
    company_address: '',
    primary_color: '#000000',
    default_timezone: 'America/Chicago',
    logo_url: '',
    job_status_colors: {},
    // Lead pipeline aging thresholds (for color-coded "promising" leads)
    lead_fresh_days: 7,
    lead_stale_days: 30,
    // Route Planner feature toggle
    route_planner_enabled: false,
    // Mapbox Geocoding (now the only supported provider)
    mapbox_access_token: '',
  })

  const loadSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: settings } = await supabase
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (settings) {
      setForm({
        company_name: settings.company_name || '',
        company_email: settings.company_email || '',
        company_phone: settings.company_phone || '',
        company_address: settings.company_address || '',
        primary_color: settings.primary_color || '#000000',
        default_timezone: settings.default_timezone || 'America/Chicago',
        logo_url: settings.logo_url || '',
        job_status_colors: settings.job_status_colors || {},
        // Lead pipeline thresholds (with sensible defaults if not yet set in DB)
        lead_fresh_days: settings.lead_fresh_days ?? 7,
        lead_stale_days: settings.lead_stale_days ?? 30,
        route_planner_enabled: settings.route_planner_enabled ?? false,
        mapbox_access_token: settings.mapbox_access_token || '',
      })

      if (settings.job_statuses && Array.isArray(settings.job_statuses)) {
        setStatuses(settings.job_statuses)
      }
    }

    const { data: stripe } = await supabase
      .from('user_stripe_settings')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single()

    setStripeConnected(!!stripe?.stripe_account_id)
    setLoading(false)
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // Handle Stripe OAuth redirect
  useEffect(() => {
    const connectedParam = searchParams.get('stripe_connected')
    if (connectedParam === 'true') {
      setShowConnectionSuccess(true)
      loadSettings()
      setTimeout(() => {
        window.history.replaceState({}, '', '/dashboard/settings')
      }, 200)
      setTimeout(() => {
        setShowConnectionSuccess(false)
      }, 6000)
    }
  }, [searchParams])

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `logos/${user.id}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('company-logos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('company-logos')
        .getPublicUrl(filePath)

      setForm({ ...form, logo_url: publicUrl })
      setConfirmDialog({
        open: true,
        title: "Success",
        description: "Logo uploaded successfully!",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } catch (err: any) {
      setConfirmDialog({
        open: true,
        title: "Upload Failed",
        description: "Upload failed: " + err.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('company_settings').upsert({
      user_id: user.id,
      ...form,
      job_statuses: statuses,
      updated_at: new Date().toISOString(),
    })

    setSaving(false)
    if (error) {
      setConfirmDialog({
        open: true,
        title: "Save Failed",
        description: "Failed to save: " + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } else {
      setConfirmDialog({
        open: true,
        title: "Success",
        description: "Settings saved successfully!",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    }
  }

  const handleConnectStripe = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setConfirmDialog({
        open: true,
        title: "Authentication Required",
        description: "You must be logged in",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
      return
    }
    const clientId = process.env.NEXT_PUBLIC_STRIPE_CONNECT_CLIENT_ID
    const redirectUri = `${window.location.origin}/api/stripe/connect/callback`
    const state = `${user.id}:${crypto.randomUUID()}`
    document.cookie = `stripe_oauth_state=${state}; path=/; max-age=600; SameSite=Lax`
    const url = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
    window.location.href = url
  }

  const timezones = [
    { value: "America/Chicago", label: "Central Time (Chicago)" },
    { value: "America/New_York", label: "Eastern Time (New York)" },
    { value: "America/Denver", label: "Mountain Time (Denver)" },
    { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
    { value: "America/Phoenix", label: "Arizona Time (Phoenix)" },
    { value: "America/Anchorage", label: "Alaska Time" },
    { value: "Pacific/Honolulu", label: "Hawaii Time" },
    { value: "Europe/London", label: "GMT / London" },
    { value: "Europe/Paris", label: "Central European Time (Paris)" },
    { value: "Europe/Berlin", label: "Central European Time (Berlin)" },
    { value: "Asia/Tokyo", label: "Japan Standard Time (Tokyo)" },
    { value: "Australia/Sydney", label: "Australian Eastern Time (Sydney)" },
    { value: "Asia/Dubai", label: "Gulf Standard Time (Dubai)" },
    { value: "Asia/Kolkata", label: "India Standard Time" },
  ]

  if (loading) {
    return <div className="p-8">Loading settings...</div>
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your company settings and preferences</p>
      </div>

      {showConnectionSuccess && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
          <CheckCircle className="h-5 w-5 flex-shrink-0" />
          <span>Stripe account connected successfully!</span>
        </div>
      )}

      <div className="space-y-8">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Company Name</Label>
                <Input
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Company Email</Label>
                <Input
                  type="email"
                  value={form.company_email}
                  onChange={(e) => setForm({ ...form, company_email: e.target.value })}
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label>Phone Number</Label>
              <Input
                value={form.company_phone}
                onChange={(e) => setForm({ ...form, company_phone: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea
                value={form.company_address}
                onChange={(e) => setForm({ ...form, company_address: e.target.value })}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Scheduling Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduling Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Default Timezone</Label>
              <Select
                value={form.default_timezone}
                onValueChange={(value) => setForm({ ...form, default_timezone: value })}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {timezones.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                All scheduled dates and times in the app will use this timezone.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Lead Pipeline Settings - NEW for Leads feature */}
        <Card>
          <CardHeader>
            <CardTitle>Lead Pipeline</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configure how "promising" a lead looks based on its age. These thresholds control the green / yellow / red styling on the Leads page and Dashboard glance.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Fresh lead window (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.lead_fresh_days}
                  onChange={(e) => setForm({ ...form, lead_fresh_days: parseInt(e.target.value) || 7 })}
                  className="mt-2"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Leads younger than this many days get <span className="text-green-600 font-medium">green</span> styling (fresh / high priority).
                </p>
              </div>
              <div>
                <Label>Stale lead threshold (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.lead_stale_days}
                  onChange={(e) => setForm({ ...form, lead_stale_days: parseInt(e.target.value) || 30 })}
                  className="mt-2"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Leads older than this many days get <span className="text-red-600 font-medium">red</span> styling (stale / needs attention).
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Leads between the two thresholds get yellow/amber styling.
            </p>
          </CardContent>
        </Card>

        {/* Productivity Tools */}
        <Card>
          <CardHeader>
            <CardTitle>Productivity Tools</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enable advanced operational features for your team.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between border p-4">
              <div>
                <div className="font-medium">Route Planner</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Show a Route Planner card on the Dashboard and enable the full Route Planner page in the sidebar. 
                  Plans optimal driving routes for today's scheduled jobs that have addresses.
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.route_planner_enabled}
                  onChange={(e) => setForm({ ...form, route_planner_enabled: e.target.checked })}
                  className="h-4 w-4"
                />
                <span className="text-sm">Enabled</span>
              </label>
            </div>

            {/* Geocoding Configuration (Mapbox only) */}
            <div className="border p-4 space-y-4">
              <div>
                <div className="font-medium">Mapbox Geocoding</div>
                <p className="text-xs text-muted-foreground mt-1">
                  The Route Planner uses Mapbox to convert addresses into coordinates. A valid access token is required.
                </p>
              </div>

              <div>
                <Label>Mapbox Access Token</Label>
                <Input
                  type="password"
                  placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOiJ..."
                  value={form.mapbox_access_token}
                  onChange={(e) => setForm({ ...form, mapbox_access_token: e.target.value })}
                  className="mt-1 font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Get a free token at <a href="https://account.mapbox.com/access-tokens/" target="_blank" className="underline">account.mapbox.com</a>. 
                  The free tier includes 100,000 geocoding requests per month (very generous for small teams).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Branding - Fully working logo upload */}
        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Company Logo</Label>
              <div className="mt-2 flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed overflow-hidden bg-muted">
                  {form.logo_url ? (
                    <img
                      src={form.logo_url}
                      alt="Company Logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-sm text-muted-foreground">Logo</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.onchange = handleLogoUpload as any
                    input.click()
                  }}
                  disabled={uploadingLogo}
                >
                  {uploadingLogo ? (
                    <>Uploading...</>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Logo
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Recommended: 512×512px PNG or JPG. Will be used in invoices, contracts, and client portal.</p>
            </div>

            <div>
              <Label>Primary Brand Color</Label>
              <div className="mt-2 flex gap-3">
                <Input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="h-10 w-20 p-1"
                />
                <Input value={form.primary_color} className="flex-1" readOnly />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stripe Connect */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Payment Processing (Stripe)</CardTitle>
              {stripeConnected && <Badge className="bg-green-600">Connected</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!stripeConnected ? (
              <Button onClick={handleConnectStripe} size="lg">
                Connect with Stripe
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-5 w-5" />
                <span>Your Stripe account is connected and ready to accept payments.</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Connect your Stripe account so clients pay you directly.
            </p>
          </CardContent>
        </Card>

        {/* Job Statuses */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Job Statuses</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Customize, rename, add, or remove statuses. These will be used across the entire product.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const newKey = `custom_${Date.now()}`
                  setStatuses([
                    ...statuses,
                    { key: newKey, label: "New Status", color: "#64748b" }
                  ])
                }}
              >
                + Add Status
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {statuses.map((status, index) => (
                <div key={status.key} className="flex items-center gap-3 rounded-2xl border p-3">
                  <Input
                    type="color"
                    value={status.color}
                    onChange={(e) => {
                      const newStatuses = [...statuses]
                      newStatuses[index].color = e.target.value
                      setStatuses(newStatuses)
                    }}
                    className="h-9 w-14 p-1 flex-shrink-0"
                  />
                  <Input
                    value={status.label}
                    onChange={(e) => {
                      const newStatuses = [...statuses]
                      newStatuses[index].label = e.target.value
                      setStatuses(newStatuses)
                    }}
                    className="flex-1"
                    placeholder="Status name"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (statuses.length === 1) {
                        setConfirmDialog({
                          open: true,
                          title: "Validation Error",
                          description: "You must have at least one status.",
                          confirmLabel: "OK",
                          onConfirm: () => setConfirmDialog({ open: false })
                        })
                        return
                      }
                      setConfirmDialog({
                        open: true,
                        title: "Delete Status?",
                        description: `Delete "${status.label}"?`,
                        confirmLabel: "Delete",
                        destructive: true,
                        onConfirm: () => {
                          setConfirmDialog({ open: false })
                          const newStatuses = statuses.filter((_, i) => i !== index)
                          setStatuses(newStatuses)
                        }
                      })
                      const newStatuses = statuses.filter((_, i) => i !== index)
                      setStatuses(newStatuses)
                    }}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Note: Changing status keys may affect existing jobs. Renaming labels is safe.
            </p>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All Changes"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title || ""}
        description={confirmDialog.description || ""}
        confirmLabel={confirmDialog.confirmLabel || "OK"}
        onConfirm={confirmDialog.onConfirm || (() => setConfirmDialog({ open: false }))}
      />
    </div>
  )
}
