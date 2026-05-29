'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react'

// Type for our intake data
interface IntakeData {
  company_name?: string
  company_address?: string
  company_email?: string
  company_phone?: string
  primary_color?: string
  logo_url?: string
  logo_file?: File | null
  default_timezone?: string
  default_job_duration_minutes?: number
  // Simple business hours for now (same for Mon-Fri)
  business_hours_start?: string
  business_hours_end?: string
  job_statuses?: Array<{ key: string; label: string; color: string }>
  mapbox_access_token?: string
  route_planner_enabled?: boolean
  lead_fresh_days?: number
  lead_stale_days?: number
}

const TOTAL_STEPS = 5

const defaultJobStatuses = [
  { key: 'quote_sent', label: 'Quote Sent', color: '#eab308' },
  { key: 'scheduled', label: 'Scheduled', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#8b5cf6' },
  { key: 'completed', label: 'Completed', color: '#22c55e' },
  { key: 'invoiced', label: 'Invoiced', color: '#f97316' },
  { key: 'paid', label: 'Paid', color: '#10b981' },
];

export default function OnboardingWizard() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  const [currentStep, setCurrentStep] = useState<'welcome' | number | 'complete'>('welcome')
  const [intakeData, setIntakeData] = useState<IntakeData>({})
  const [isCompleting, setIsCompleting] = useState(false)
  const [provisioningStep, setProvisioningStep] = useState(0)
  const [provisioningError, setProvisioningError] = useState<string | null>(null)

  const stepNumber = typeof currentStep === 'number' ? currentStep : 0
  const progress = stepNumber > 0 ? Math.round(((stepNumber - 1) / TOTAL_STEPS) * 100) : 0

  // Navigation helpers
  const goToStep = (step: number) => setCurrentStep(step)
  const nextStep = async () => {
    if (typeof currentStep === 'number' && currentStep < TOTAL_STEPS) {
      const next = currentStep + 1;

      // Initialize job statuses when first entering step 3
      if (next === 3 && !intakeData.job_statuses) {
        updateData({ job_statuses: defaultJobStatuses });
      }

      setCurrentStep(next);
      return;
    }

    // Handle "Complete Setup" on the Review step (step 5)
    if (currentStep === 5) {
      if (!sessionId) {
        setProvisioningError('Missing Stripe session ID. Please go back to the pricing page and try again.');
        return;
      }

      setIsCompleting(true);
      setProvisioningError(null);
      setProvisioningStep(0);

      // Start visual progress steps (these are optimistic but feel good)
      const stepInterval = setInterval(() => {
        setProvisioningStep(prev => Math.min(prev + 1, 3));
      }, 1100);

      try {
        const res = await fetch('/api/onboarding/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId,
            intakeData: intakeData,
          }),
        });

        const result = await res.json();

        if (!res.ok) {
          console.error('Onboarding complete failed:', result);
          throw new Error(result.error || 'Failed to complete onboarding');
        }

        // Success — clear interval and move to completion screen
        clearInterval(stepInterval);
        console.log('Provisioning result:', result);
        setCurrentStep('complete');

      } catch (error: any) {
        clearInterval(stepInterval);
        console.error('Failed to complete onboarding:', error);
        setProvisioningError(error.message || 'Something went wrong. Please try again.');
        setIsCompleting(false); // allow retry on error
      }
    }
  }
  const prevStep = () => {
    if (typeof currentStep === 'number' && currentStep > 1) {
      setCurrentStep(currentStep - 1)
    } else {
      setCurrentStep('welcome')
    }
  }

  // Update intake data helper
  const updateData = (updates: Partial<IntakeData>) => {
    setIntakeData(prev => ({ ...prev, ...updates }))
  }

  // ==================== WELCOME SCREEN ====================
  if (currentStep === 'welcome') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary text-primary-foreground mb-6">
            <span className="text-3xl font-bold tracking-[-2px]">SP</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mb-4">
            Welcome to ServicePortal
          </h1>
          <p className="text-xl text-muted-foreground">
            Let’s get your account set up in just a few minutes.
          </p>
        </div>

        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>Thank you for subscribing</CardTitle>
            <CardDescription>
              We’ve received your payment. Now we’ll configure your ServicePortal instance
              with your company details, branding, and default settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-sm text-muted-foreground">
              This setup wizard will pre-fill everything that normally lives in Settings.
              You can change any of it later.
            </div>

            <Button
              size="lg"
              className="w-full rounded-none"
              onClick={() => setCurrentStep(1)}
            >
              Start Setup Wizard
            </Button>

            {sessionId && (
              <div className="text-xs text-muted-foreground text-center">
                Payment session verified
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ==================== MULTI-STEP WIZARD ====================
  if (typeof currentStep === 'number') {
    return (
      <div>
        {/* Progress Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-3xl font-semibold tracking-tight">Setup Wizard</h1>
            <div className="text-sm text-muted-foreground">
              Step {currentStep} of {TOTAL_STEPS}
            </div>
          </div>
          <div className="h-1 bg-muted rounded-none">
            <div 
              className="h-1 bg-primary transition-all rounded-none" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>

        {/* Step Content */}
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>
              {currentStep === 1 && "Company Information"}
              {currentStep === 2 && "Branding (Logo & Color)"}
              {currentStep === 3 && "Operations Defaults"}
              {currentStep === 4 && "Integrations & Lead Settings"}
              {currentStep === 5 && "Review"}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && "Basic details about your business"}
              {currentStep === 2 && "Logo and brand color"}
              {currentStep === 3 && "Timezone, job statuses, business hours & defaults"}
              {currentStep === 4 && "Mapbox, Route Planner & Lead thresholds"}
              {currentStep === 5 && "Review everything before finishing setup"}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Step 1: Company Info */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Company Name *</label>
                  <input
                    type="text"
                    className="w-full border rounded-none p-3 text-sm"
                    placeholder="Smith Plumbing LLC"
                    value={intakeData.company_name || ''}
                    onChange={(e) => updateData({ company_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Business Address</label>
                  <input
                    type="text"
                    className="w-full border rounded-none p-3 text-sm"
                    placeholder="123 Main St, Austin, TX 78701"
                    value={intakeData.company_address || ''}
                    onChange={(e) => updateData({ company_address: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Contact Email</label>
                    <input
                      type="email"
                      className="w-full border rounded-none p-3 text-sm"
                      value={intakeData.company_email || ''}
                      onChange={(e) => updateData({ company_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      className="w-full border rounded-none p-3 text-sm"
                      value={intakeData.company_phone || ''}
                      onChange={(e) => updateData({ company_phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Branding */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Primary Brand Color</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      className="h-12 w-20 border rounded-none p-1 bg-background"
                      value={intakeData.primary_color || '#000000'}
                      onChange={(e) => updateData({ primary_color: e.target.value })}
                    />
                    <div className="text-sm text-muted-foreground">
                      This will be used for buttons, accents, and PDF headers.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Company Logo</label>
                  <div className="border border-dashed border-border p-6 rounded-none text-center">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="logo-upload"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          const reader = new FileReader()
                          reader.onload = (ev) => {
                            updateData({
                              logo_file: file,
                              logo_url: ev.target?.result as string,
                            })
                          }
                          reader.readAsDataURL(file)
                        }
                      }}
                    />
                    <label htmlFor="logo-upload" className="cursor-pointer">
                      {intakeData.logo_url ? (
                        <div className="flex flex-col items-center gap-3">
                          <img
                            src={intakeData.logo_url}
                            alt="Logo preview"
                            className="max-h-24 object-contain"
                          />
                          <span className="text-sm text-muted-foreground">
                            Click to change logo
                          </span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <div className="mb-2">Click to upload logo</div>
                          <div className="text-xs">PNG, JPG or SVG recommended</div>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Operations Defaults */}
            {currentStep === 3 && (
              <div className="space-y-8">
                {/* Timezone */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Default Timezone</label>
                  <select
                    className="w-full border rounded-none p-3 text-sm bg-background"
                    value={intakeData.default_timezone || 'America/Chicago'}
                    onChange={(e) => updateData({ default_timezone: e.target.value })}
                  >
                    <option value="America/New_York">Eastern Time (US & Canada)</option>
                    <option value="America/Chicago">Central Time (US & Canada)</option>
                    <option value="America/Denver">Mountain Time (US & Canada)</option>
                    <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                    <option value="UTC">UTC</option>
                    <option value="Europe/London">London</option>
                  </select>
                </div>

                {/* Default Job Duration */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Default Job Duration (minutes)</label>
                  <input
                    type="number"
                    className="w-full border rounded-none p-3 text-sm"
                    value={intakeData.default_job_duration_minutes ?? 60}
                    onChange={(e) => updateData({ default_job_duration_minutes: parseInt(e.target.value) || 60 })}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Used when scheduling new jobs (can be overridden per job).
                  </div>
                </div>

                {/* Business Hours */}
                <div>
                  <label className="block text-sm font-medium mb-1.5">Business Hours (Weekdays)</label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">Start</div>
                      <input
                        type="time"
                        className="w-full border rounded-none p-3 text-sm"
                        value={intakeData.business_hours_start || '08:00'}
                        onChange={(e) => updateData({ business_hours_start: e.target.value })}
                      />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">End</div>
                      <input
                        type="time"
                        className="w-full border rounded-none p-3 text-sm"
                        value={intakeData.business_hours_end || '17:00'}
                        onChange={(e) => updateData({ business_hours_end: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Editable Job Statuses */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium">Job Statuses</label>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-none"
                      onClick={() => {
                        const current = intakeData.job_statuses || defaultJobStatuses;
                        const newStatus = {
                          key: `status_${Date.now()}`,
                          label: 'New Status',
                          color: '#64748b',
                        };
                        updateData({ job_statuses: [...current, newStatus] });
                      }}
                    >
                      + Add Status
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(intakeData.job_statuses || defaultJobStatuses).map((status, index) => (
                      <div key={index} className="flex gap-3 items-center border p-3 rounded-none">
                        <input
                          type="color"
                          className="h-9 w-12 border rounded-none p-1"
                          value={status.color}
                          onChange={(e) => {
                            const updated = [...(intakeData.job_statuses || defaultJobStatuses)];
                            updated[index] = { ...status, color: e.target.value };
                            updateData({ job_statuses: updated });
                          }}
                        />
                        <input
                          type="text"
                          className="flex-1 border rounded-none p-2 text-sm"
                          value={status.label}
                          onChange={(e) => {
                            const updated = [...(intakeData.job_statuses || defaultJobStatuses)];
                            updated[index] = { ...status, label: e.target.value };
                            updateData({ job_statuses: updated });
                          }}
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-none"
                          onClick={() => {
                            const updated = (intakeData.job_statuses || defaultJobStatuses).filter((_, i) => i !== index);
                            updateData({ job_statuses: updated });
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    These will become the default options when creating or updating jobs.
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Integrations */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Mapbox Access Token (Optional)</label>
                  <input
                    type="text"
                    className="w-full border rounded-none p-3 text-sm font-mono"
                    placeholder="pk.eyJ1Ijo..."
                    value={intakeData.mapbox_access_token || ''}
                    onChange={(e) => updateData({ mapbox_access_token: e.target.value })}
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Required for Route Planner and address lookup features.
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="route-planner"
                    className="h-4 w-4"
                    checked={intakeData.route_planner_enabled ?? false}
                    onChange={(e) => updateData({ route_planner_enabled: e.target.checked })}
                  />
                  <label htmlFor="route-planner" className="text-sm font-medium">
                    Enable Route Planner
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-3">Lead Pipeline Thresholds</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Fresh leads (days)</div>
                      <input
                        type="number"
                        className="w-full border rounded-none p-3 text-sm"
                        value={intakeData.lead_fresh_days ?? 7}
                        onChange={(e) => updateData({ lead_fresh_days: parseInt(e.target.value) || 7 })}
                      />
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Stale leads (days)</div>
                      <input
                        type="number"
                        className="w-full border rounded-none p-3 text-sm"
                        value={intakeData.lead_stale_days ?? 30}
                        onChange={(e) => updateData({ lead_stale_days: parseInt(e.target.value) || 30 })}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Leads younger than "Fresh" will be highlighted green. Leads older than "Stale" will be highlighted red.
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Review Summary */}
            {currentStep === 5 && (
              <div className="space-y-8">
                {/* Company Info */}
                <div>
                  <div className="font-medium text-sm mb-2 text-muted-foreground">Company Information</div>
                  <div className="border p-4 space-y-1 text-sm">
                    <div><span className="font-medium">Name:</span> {intakeData.company_name || '—'}</div>
                    <div><span className="font-medium">Address:</span> {intakeData.company_address || '—'}</div>
                    <div><span className="font-medium">Email:</span> {intakeData.company_email || '—'}</div>
                    <div><span className="font-medium">Phone:</span> {intakeData.company_phone || '—'}</div>
                  </div>
                </div>

                {/* Branding */}
                <div>
                  <div className="font-medium text-sm mb-2 text-muted-foreground">Branding</div>
                  <div className="border p-4 flex items-center gap-4">
                    <div 
                      className="w-8 h-8 border" 
                      style={{ backgroundColor: intakeData.primary_color || '#000000' }}
                    />
                    <div className="text-sm">
                      Primary Color: {intakeData.primary_color || '—'}
                    </div>
                    {intakeData.logo_url && (
                      <img src={intakeData.logo_url} alt="Logo" className="h-8 ml-auto" />
                    )}
                  </div>
                </div>

                {/* Operations */}
                <div>
                  <div className="font-medium text-sm mb-2 text-muted-foreground">Operations Defaults</div>
                  <div className="border p-4 space-y-1 text-sm">
                    <div><span className="font-medium">Timezone:</span> {intakeData.default_timezone || '—'}</div>
                    <div><span className="font-medium">Default Job Duration:</span> {intakeData.default_job_duration_minutes || 60} minutes</div>
                    <div><span className="font-medium">Business Hours:</span> {(intakeData.business_hours_start || '08:00')} – {(intakeData.business_hours_end || '17:00')}</div>
                    
                    <div className="pt-2">
                      <div className="font-medium mb-1">Job Statuses:</div>
                      <div className="flex flex-wrap gap-2">
                        {(intakeData.job_statuses || []).map((status, i) => (
                          <div 
                            key={i} 
                            className="px-2 py-0.5 text-xs border flex items-center gap-1.5"
                            style={{ borderLeft: `4px solid ${status.color}` }}
                          >
                            {status.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Integrations */}
                <div>
                  <div className="font-medium text-sm mb-2 text-muted-foreground">Integrations & Leads</div>
                  <div className="border p-4 space-y-1 text-sm">
                    <div><span className="font-medium">Route Planner:</span> {intakeData.route_planner_enabled ? 'Enabled' : 'Disabled'}</div>
                    <div><span className="font-medium">Mapbox Token:</span> {intakeData.mapbox_access_token ? 'Provided' : 'Not provided'}</div>
                    <div><span className="font-medium">Lead Thresholds:</span> Fresh &lt; {intakeData.lead_fresh_days ?? 7} days, Stale &gt; {intakeData.lead_stale_days ?? 30} days</div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5 specific error / completion states */}
            {currentStep === 5 && provisioningError && (
              <div className="mt-6 border border-destructive bg-destructive/10 p-4 text-sm text-destructive rounded-none">
                <strong>Failed to complete setup:</strong> {provisioningError}
                <div className="mt-3">
                  <Button 
                    onClick={nextStep} 
                    className="rounded-none"
                    variant="outline"
                  >
                    Try Completing Setup Again
                  </Button>
                </div>
              </div>
            )}

            {/* Special Provisioning Loading State for Step 5 */}
            {currentStep === 5 && isCompleting && !provisioningError && (
              <div className="py-8">
                <div className="text-center mb-6">
                  <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                  <h3 className="text-xl font-semibold tracking-tight">
                    Setting up your ServicePortal account...
                  </h3>
                </div>

                <div className="max-w-sm mx-auto space-y-2 text-sm">
                  {[
                    "Verifying payment with Stripe",
                    "Creating your user account",
                    "Applying your company settings & branding",
                    "Sending your secure magic login link"
                  ].map((label, index) => (
                    <div 
                      key={index}
                      className={`flex items-center gap-2 p-2 border rounded-none ${
                        provisioningStep >= index ? 'border-primary bg-primary/5' : 'border-border opacity-50'
                      }`}
                    >
                      <span>{provisioningStep > index ? '✓' : index + 1}.</span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Normal Navigation (hidden during active provisioning on step 5) */}
            {!(currentStep === 5 && isCompleting && !provisioningError) && (
              <div className="flex justify-between pt-6 border-t">
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={prevStep}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>

                <Button
                  className="rounded-none"
                  onClick={nextStep}
                  disabled={currentStep === 1 && !intakeData.company_name || isCompleting}
                >
                  {isCompleting && currentStep === 5 ? 'Completing...' : 
                   currentStep === 5 ? 'Complete Setup' : 
                   currentStep === 4 ? 'Continue to Review' : 'Continue'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  // ==================== COMPLETION SCREEN ====================
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)

  const handleResendMagicLink = async () => {
    if (!intakeData.company_email) return

    setResending(true)
    setResendMessage(null)

    try {
      const res = await fetch('/api/auth/resend-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: intakeData.company_email }),
      })

      const result = await res.json()

      if (result.success) {
        setResendMessage('Magic link sent! Check your email.')
      } else {
        setResendMessage(result.error || 'Failed to send magic link.')
      }
    } catch (e) {
      setResendMessage('Something went wrong. Please try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto text-center py-16">
      <CheckCircle className="h-16 w-16 mx-auto text-green-600 mb-6" />
      <h1 className="text-3xl font-semibold tracking-tight mb-3">You're All Set!</h1>
      
      <p className="text-muted-foreground mb-6">
        Your payment has been verified and your ServicePortal instance has been 
        pre-configured with the details you provided.
      </p>

      {intakeData.company_email && (
        <p className="text-sm mb-8">
          An account has been created for <strong>{intakeData.company_email}</strong>.
          <br />
          We sent a magic link to set your password.
        </p>
      )}

      <div className="space-y-4">
        <Button 
          className="rounded-none w-full" 
          size="lg"
          onClick={() => window.location.href = '/login'}
        >
          Go to Login
        </Button>

        {intakeData.company_email && (
          <Button 
            variant="outline"
            className="rounded-none w-full"
            onClick={handleResendMagicLink}
            disabled={resending}
          >
            {resending ? 'Sending...' : 'Resend Magic Link'}
          </Button>
        )}

        {resendMessage && (
          <p className="text-sm text-green-600">{resendMessage}</p>
        )}

        <p className="text-xs text-muted-foreground pt-4">
          You can change any of your settings after logging in.
        </p>
      </div>
    </div>
  )
}
