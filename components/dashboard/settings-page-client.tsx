'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAccountSettingsAction, getCompanySubscriptionAccessAction } from '@/app/action'
import {
  getPlatformFeatureUpgradeMessage,
  type PlanEntitlements,
} from '@/lib/platform-entitlements'
import { AppearanceSettings } from '@/components/appearance-settings'
import { CompanyProfileSettings } from '@/components/dashboard/company-profile-settings'
import { JobPhotoCategoriesSettings } from '@/components/dashboard/job-photo-categories-settings'
import { NotificationSettings } from '@/components/dashboard/notification-settings'
import { IntegrationsSettings } from '@/components/dashboard/integrations-settings'
import { PlatformSubscriptionSettings } from '@/components/dashboard/platform-subscription-settings'
import { StripeConnectSettings } from '@/components/dashboard/stripe-connect-settings'
import { DocumentTemplateEditor } from '@/components/dashboard/document-template-editor'
import { UserProfileSettings } from '@/components/dashboard/user-profile-settings'
import { UserSignInSettings } from '@/components/dashboard/user-sign-in-settings'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  Bell,
  Building2,
  Camera,
  CreditCard,
  FileText,
  KeyRound,
  Link2,
  Palette,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react'
import {
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
  type PlatformPlanId,
  type PlatformSubscriptionStatus,
} from '@/lib/platform-billing'
import { toast } from 'sonner'

type SettingsSectionId =
  | 'profile'
  | 'sign-in'
  | 'appearance'
  | 'company'
  | 'billing'
  | 'subscription'
  | 'invoice-template'
  | 'job-photos'
  | 'notifications'
  | 'integrations'

type SettingsSection = {
  id: SettingsSectionId
  label: string
  description: string
  icon: LucideIcon
  adminOnly?: boolean
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your name and profile photo.',
    icon: User,
  },
  {
    id: 'sign-in',
    label: 'Sign in',
    description: 'Email and password.',
    icon: KeyRound,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Light or dark mode.',
    icon: Palette,
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Branding, location, and hours.',
    icon: Building2,
    adminOnly: true,
  },
  {
    id: 'billing',
    label: 'Payments',
    description: 'Stripe Connect for client payments.',
    icon: CreditCard,
    adminOnly: true,
  },
  {
    id: 'subscription',
    label: 'Subscription',
    description: 'Your platform plan and billing.',
    icon: Sparkles,
    adminOnly: true,
  },
  {
    id: 'invoice-template',
    label: 'Document templates',
    description: 'Invoice and estimate PDF layouts.',
    icon: FileText,
    adminOnly: true,
  },
  {
    id: 'job-photos',
    label: 'Job photos',
    description: 'Photo upload categories.',
    icon: Camera,
    adminOnly: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Email and SMS alerts.',
    icon: Bell,
    adminOnly: true,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'QuickBooks, Google Calendar, Zapier.',
    icon: Link2,
    adminOnly: true,
  },
]

type CompanySettings = {
  name?: string | null
  logo_url?: string | null
  timezone?: string | null
  business_hours_start?: string | null
  business_hours_end?: string | null
  address?: string | null
  address_street?: string | null
  address_unit?: string | null
  address_city?: string | null
  address_state?: string | null
  address_zip?: string | null
  is_solo_business?: boolean | null
} | null

function SettingsSectionButton({
  section,
  isActive,
  onClick,
  locked = false,
  lockedTooltip,
}: {
  section: SettingsSection
  isActive: boolean
  onClick: () => void
  locked?: boolean
  lockedTooltip?: string
}) {
  const Icon = section.icon

  const button = (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      disabled={locked}
      aria-disabled={locked || undefined}
      className={cn(
        'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
        locked
          ? 'cursor-not-allowed text-muted-foreground/45'
          : isActive
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="flex items-start gap-3">
        <Icon className={cn('size-4 mt-0.5 shrink-0', locked && 'opacity-50')} />
        <span className="min-w-0">
          <span className={cn('block text-sm font-medium', locked && 'opacity-70')}>
            {section.label}
          </span>
          <span className={cn('block text-xs opacity-80 mt-0.5', locked && 'opacity-50')}>
            {section.description}
          </span>
        </span>
      </span>
    </button>
  )

  if (!locked || !lockedTooltip) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" className="max-w-xs">
        {lockedTooltip}
      </TooltipContent>
    </Tooltip>
  )
}

function SettingsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [company, setCompany] = useState<CompanySettings>(null)
  const [role, setRole] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>('idle')
  const [profileSaveMessage, setProfileSaveMessage] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState<PlatformPlanId>('trial')
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<PlatformSubscriptionStatus>('trialing')
  const [hasPlatformCustomer, setHasPlatformCustomer] = useState(false)
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null)

  const isAdmin = role === 'company_admin'

  const visibleSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter((section) => {
        if (section.adminOnly && !isAdmin) return false
        return true
      }),
    [isAdmin]
  )

  const integrationsLocked = Boolean(entitlements && !entitlements.integrations)
  const integrationsUpgradeMessage = getPlatformFeatureUpgradeMessage('integrations')

  const requestedSection = searchParams.get('section') as SettingsSectionId | null
  const activeSection =
    visibleSections.find((section) => section.id === requestedSection)?.id ||
    visibleSections[0]?.id ||
    'profile'

  const setActiveSection = useCallback(
    (sectionId: SettingsSectionId) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('section', sectionId)
      router.replace(`/dashboard/settings?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  const handleProfileSaveStatusChange = useCallback(
    (status: SaveStatus, message?: string) => {
      setProfileSaveStatus(status)
      setProfileSaveMessage(message || '')
    },
    []
  )

  useEffect(() => {
    const loadSettings = async () => {
      const accountResult = await getAccountSettingsAction()
      if (accountResult.success) {
        setRole(accountResult.account.role)
        setFullName(accountResult.account.fullName)
        setEmail(accountResult.account.email)
        setAvatarUrl(accountResult.account.avatarUrl)
      } else {
        toast.error(accountResult.error || 'Failed to load account settings')
      }

      if (accountResult.success && accountResult.account.role === 'company_admin') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('company_id')
            .eq('id', user.id)
            .single()

          if (profile?.company_id) {
            const { data: companyData } = await supabase
              .from('companies')
              .select(`
                name,
                logo_url,
                timezone,
                business_hours_start,
                business_hours_end,
                address,
                address_street,
                address_unit,
                address_city,
                address_state,
                address_zip,
                is_solo_business,
                subscription_plan,
                subscription_status,
                stripe_platform_customer_id
              `)
              .eq('id', profile.company_id)
              .single()

            setCompany(companyData)
            setSubscriptionPlan(normalizePlatformPlan(companyData?.subscription_plan))
            setSubscriptionStatus(
              normalizeSubscriptionStatus(companyData?.subscription_status)
            )
            setHasPlatformCustomer(Boolean(companyData?.stripe_platform_customer_id))
          }
        }
      }

      const accessResult = await getCompanySubscriptionAccessAction()
      if (accessResult.success) {
        setEntitlements(accessResult.entitlements)
      }

      setIsLoading(false)
    }

    loadSettings()
  }, [supabase])

  useEffect(() => {
    if (requestedSection === 'integrations' && integrationsLocked) {
      const params = new URLSearchParams(searchParams.toString())
      params.set('section', 'subscription')
      params.set('upgrade', 'integrations')
      router.replace(`/dashboard/settings?${params.toString()}`, { scroll: false })
      return
    }

    if (
      requestedSection &&
      !visibleSections.some((section) => section.id === requestedSection)
    ) {
      setActiveSection(visibleSections[0]?.id || 'profile')
    }
  }, [
    integrationsLocked,
    requestedSection,
    router,
    searchParams,
    setActiveSection,
    visibleSections,
  ])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  const roleLabel =
    role === 'team_member' ? 'Team Member' : role === 'company_admin' ? 'Admin' : role || 'Member'

  const activeMeta = visibleSections.find((section) => section.id === activeSection)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b px-4 py-4 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? 'Manage your profile, company preferences, billing, and notifications.'
            : 'Manage your profile and personal preferences.'}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="shrink-0 border-b lg:flex lg:w-72 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r xl:w-80">
          <ScrollArea className="w-full lg:min-h-0 lg:flex-1" viewportClassName="scroll-fade-x lg:scroll-fade">
            <TooltipProvider>
              <nav className="flex lg:flex-col gap-1 p-3 min-w-max lg:min-w-0">
                {visibleSections.map((section) => (
                  <SettingsSectionButton
                    key={section.id}
                    section={section}
                    isActive={activeSection === section.id}
                    onClick={() => setActiveSection(section.id)}
                    locked={section.id === 'integrations' && integrationsLocked}
                    lockedTooltip={
                      section.id === 'integrations' && integrationsLocked
                        ? integrationsUpgradeMessage
                        : undefined
                    }
                  />
                ))}
              </nav>
            </TooltipProvider>
          </ScrollArea>
        </aside>

        {activeSection === 'invoice-template' && isAdmin ? (
          <ScrollArea className="min-h-0 flex-1" viewportClassName="scroll-fade">
            <main className="max-w-none p-4 sm:p-6 lg:p-8">
              <DocumentTemplateEditor />
            </main>
          </ScrollArea>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <main className={cn('p-4 sm:p-6 lg:p-8', 'max-w-4xl')}>
            {activeSection === 'profile' && (
              <UserProfileSettings
                fullName={fullName}
                email={email}
                avatarUrl={avatarUrl}
                roleLabel={roleLabel}
                onFullNameChange={setFullName}
              />
            )}

            {activeSection === 'sign-in' && (
              <UserSignInSettings
                fullName={fullName}
                email={email}
                onSaved={({ fullName: savedName, email: savedEmail }) => {
                  setFullName(savedName)
                  setEmail(savedEmail)
                }}
              />
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Appearance</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose light or dark mode for the dashboard and portal.
                  </p>
                </div>
                <AppearanceSettings embedded />
              </div>
            )}

            {activeSection === 'company' && isAdmin && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Company</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Branding, office location, and scheduling defaults. Changes save
                      automatically.
                    </p>
                  </div>
                  <SaveStatusBadge status={profileSaveStatus} message={profileSaveMessage} />
                </div>
                <CompanyProfileSettings
                  company={company}
                  onSaveStatusChange={handleProfileSaveStatusChange}
                />
              </div>
            )}

            {activeSection === 'billing' && isAdmin && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Client payments</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect Stripe to enable invoicing and client payments.
                  </p>
                </div>
                <Suspense
                  fallback={
                    <p className="text-sm text-muted-foreground">Loading billing settings...</p>
                  }
                >
                  <StripeConnectSettings embedded />
                </Suspense>
              </div>
            )}

            {activeSection === 'subscription' && isAdmin && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Platform subscription</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Manage your Service Portal plan and platform billing.
                  </p>
                </div>
                <PlatformSubscriptionSettings
                  plan={subscriptionPlan}
                  status={subscriptionStatus}
                  hasCustomer={hasPlatformCustomer}
                />
              </div>
            )}

            {activeSection === 'job-photos' && isAdmin && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Job photo categories</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Custom categories and order for job site photo uploads.
                  </p>
                </div>
                <JobPhotoCategoriesSettings embedded />
              </div>
            )}

            {activeSection === 'notifications' && isAdmin && (
              <div className="space-y-6 max-w-3xl">
                <NotificationSettings embedded />
              </div>
            )}

            {activeSection === 'integrations' && isAdmin && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">Integrations</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Connect accounting, calendar, and automation tools.
                  </p>
                </div>
                <IntegrationsSettings />
              </div>
            )}

            {activeMeta && (
              <p className="sr-only">Viewing {activeMeta.label} settings</p>
            )}
            </main>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

export function SettingsPageClient() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      }
    >
      <SettingsPageContent />
    </Suspense>
  )
}