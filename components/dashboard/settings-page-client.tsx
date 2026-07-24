'use client'

import dynamic from 'next/dynamic'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { getCompanyPhotoStorageAction } from '@/app/action'
import {
  getPlatformFeatureUpgradeMessage,
  type PlanEntitlements,
} from '@/lib/platform-entitlements'
import { AppearanceSettings } from '@/components/appearance-settings'
import { UserProfileSettings } from '@/components/dashboard/user-profile-settings'
import { UserSignInSettings } from '@/components/dashboard/user-sign-in-settings'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { SettingsSectionLoadingOverlay } from '@/components/dashboard/settings-section-loading'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import { PageHeader } from '@/components/ui/page-header'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_PAGE_ROOT_CLASS,
  MOBILE_SELECT_TRIGGER_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import {
  Bell,
  Building2,
  CalendarClock,
  Camera,
  CreditCard,
  FileSignature,
  FileText,
  KeyRound,
  Layers3,
  Link2,
  Palette,
  Sparkles,
  User,
  type LucideIcon,
} from 'lucide-react'
import type { PlatformPlanId, PlatformSubscriptionStatus } from '@/lib/platform-billing'
import { toast } from 'sonner'

const sectionLoading = () => <PageLoadingSkeleton />

const CompanyProfileSettings = dynamic(
  () =>
    import('@/components/dashboard/company-profile-settings').then((m) => ({
      default: m.CompanyProfileSettings,
    })),
  { loading: sectionLoading }
)

const StripeConnectSettings = dynamic(
  () =>
    import('@/components/dashboard/stripe-connect-settings').then((m) => ({
      default: m.StripeConnectSettings,
    })),
  { loading: sectionLoading }
)

const CompanyJobPaymentSettings = dynamic(
  () =>
    import('@/components/dashboard/company-job-payment-settings').then((m) => ({
      default: m.CompanyJobPaymentSettings,
    })),
  { loading: sectionLoading }
)

const PlatformSubscriptionSettings = dynamic(
  () =>
    import('@/components/dashboard/platform-subscription-settings').then((m) => ({
      default: m.PlatformSubscriptionSettings,
    })),
  { loading: sectionLoading }
)

const DocumentTemplateEditor = dynamic(
  () =>
    import('@/components/dashboard/document-template-editor').then((m) => ({
      default: m.DocumentTemplateEditor,
    })),
  { loading: sectionLoading }
)

const ContractTemplatesSettings = dynamic(
  () =>
    import('@/components/dashboard/contract-templates-settings').then((m) => ({
      default: m.ContractTemplatesSettings,
    })),
  { loading: sectionLoading }
)

const JobPhotoCategoriesSettings = dynamic(
  () =>
    import('@/components/dashboard/job-photo-categories-settings').then((m) => ({
      default: m.JobPhotoCategoriesSettings,
    })),
  { loading: sectionLoading }
)

const PhotoStorageMeter = dynamic(
  () =>
    import('@/components/dashboard/photo-storage-meter').then((m) => ({
      default: m.PhotoStorageMeter,
    })),
  { loading: sectionLoading }
)

const ClientBookingSettings = dynamic(
  () =>
    import('@/components/dashboard/client-booking-settings').then((m) => ({
      default: m.ClientBookingSettings,
    })),
  { loading: sectionLoading }
)

const ServicePackagesSettings = dynamic(
  () =>
    import('@/components/dashboard/service-packages-settings').then((m) => ({
      default: m.ServicePackagesSettings,
    })),
  { loading: sectionLoading }
)

const NotificationSettings = dynamic(
  () =>
    import('@/components/dashboard/notification-settings').then((m) => ({
      default: m.NotificationSettings,
    })),
  { loading: sectionLoading }
)

const IntegrationsSettings = dynamic(
  () =>
    import('@/components/dashboard/integrations-settings').then((m) => ({
      default: m.IntegrationsSettings,
    })),
  { loading: sectionLoading }
)

type SettingsSectionId =
  | 'profile'
  | 'sign-in'
  | 'appearance'
  | 'company'
  | 'billing'
  | 'subscription'
  | 'invoice-template'
  | 'contract-templates'
  | 'job-photos'
  | 'service-packages'
  | 'client-booking'
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
    description: 'Your theme, then company brand colors and background.',
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
    description: 'Stripe Connect and default job payment plans.',
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
    id: 'contract-templates',
    label: 'Contract templates',
    description: 'Service agreements with signing fields.',
    icon: FileSignature,
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
    id: 'service-packages',
    label: 'Service packages',
    description: 'Reusable services for booking and jobs.',
    icon: Layers3,
    adminOnly: true,
  },
  {
    id: 'client-booking',
    label: 'Client booking',
    description: 'Public booking link and intake mode.',
    icon: CalendarClock,
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
  business_open_weekdays?: number[] | null
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
        'w-full rounded-lg px-3.5 py-3 text-left transition-colors max-md:min-h-11',
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

type SettingsPageInitialData = {
  role: string
  fullName: string
  email: string
  avatarUrl: string | null
  company: CompanySettings
  entitlements: PlanEntitlements | null
  subscriptionPlan: PlatformPlanId
  subscriptionStatus: PlatformSubscriptionStatus
  hasPlatformCustomer: boolean
}

function resolveSettingsSection(
  requestedSection: SettingsSectionId | null,
  visibleSections: SettingsSection[]
): SettingsSectionId {
  if (requestedSection && visibleSections.some((section) => section.id === requestedSection)) {
    return requestedSection
  }
  return visibleSections[0]?.id || 'profile'
}

function SettingsPageContent({ initialData }: { initialData: SettingsPageInitialData }) {
  const searchParams = useSearchParams()

  const [company, setCompany] = useState<CompanySettings>(initialData.company)
  const [role, setRole] = useState<string | null>(initialData.role)
  const [fullName, setFullName] = useState(initialData.fullName)
  const [email, setEmail] = useState(initialData.email)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialData.avatarUrl)
  const [profileSaveStatus, setProfileSaveStatus] = useState<SaveStatus>('idle')
  const [profileSaveMessage, setProfileSaveMessage] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState<PlatformPlanId>(
    initialData.subscriptionPlan
  )
  const [subscriptionStatus, setSubscriptionStatus] = useState<PlatformSubscriptionStatus>(
    initialData.subscriptionStatus
  )
  const [hasPlatformCustomer, setHasPlatformCustomer] = useState(
    initialData.hasPlatformCustomer
  )
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(
    initialData.entitlements
  )
  const [photoStorage, setPhotoStorage] = useState<{
    usedBytes: number
    limitBytes: number
    usedLabel: string
    limitLabel: string
  } | null>(null)

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
  const initialSection = resolveSettingsSection(requestedSection, visibleSections)

  const [activeSection, setActiveSectionState] =
    useState<SettingsSectionId>(initialSection)
  const [visitedSections, setVisitedSections] = useState<Set<SettingsSectionId>>(
    () => new Set([initialSection])
  )
  const [isSectionTransitioning, setIsSectionTransitioning] = useState(false)

  const syncSectionInUrl = useCallback((sectionId: SettingsSectionId) => {
    const params = new URLSearchParams(window.location.search)
    params.set('section', sectionId)
    const nextUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(window.history.state, '', nextUrl)
  }, [])

  const setActiveSection = useCallback(
    (sectionId: SettingsSectionId) => {
      if (sectionId === activeSection) return

      const isFirstVisit = !visitedSections.has(sectionId)
      if (isFirstVisit) {
        setIsSectionTransitioning(true)
        window.setTimeout(() => setIsSectionTransitioning(false), 350)
      }

      setVisitedSections((current) => {
        const next = new Set(current)
        next.add(sectionId)
        return next
      })
      setActiveSectionState(sectionId)
      syncSectionInUrl(sectionId)
    },
    [activeSection, syncSectionInUrl, visitedSections]
  )

  const handleProfileSaveStatusChange = useCallback(
    (status: SaveStatus, message?: string) => {
      setProfileSaveStatus(status)
      setProfileSaveMessage(message || '')
    },
    []
  )

  useEffect(() => {
    if (activeSection !== 'job-photos' || !isAdmin) return
    void getCompanyPhotoStorageAction().then((result) => {
      if (result.success) {
        setPhotoStorage({
          usedBytes: result.usedBytes,
          limitBytes: result.limitBytes,
          usedLabel: result.usedLabel,
          limitLabel: result.limitLabel,
        })
      }
    })
  }, [activeSection, isAdmin])

  useEffect(() => {
    if (requestedSection === 'integrations' && integrationsLocked) {
      const params = new URLSearchParams(window.location.search)
      params.set('section', 'subscription')
      params.set('upgrade', 'integrations')
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}?${params.toString()}`
      )
      setActiveSectionState('subscription')
      setVisitedSections((current) => new Set(current).add('subscription'))
      return
    }

    if (
      requestedSection &&
      !visibleSections.some((section) => section.id === requestedSection)
    ) {
      setActiveSection(visibleSections[0]?.id || 'profile')
    }
  }, [integrationsLocked, requestedSection, setActiveSection, visibleSections])

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const section = params.get('section') as SettingsSectionId | null
      const nextSection = resolveSettingsSection(section, visibleSections)
      setVisitedSections((current) => new Set(current).add(nextSection))
      setActiveSectionState(nextSection)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [visibleSections])

  const roleLabel =
    role === 'team_member' ? 'Team Member' : role === 'company_admin' ? 'Admin' : role || 'Member'

  const activeMeta = visibleSections.find((section) => section.id === activeSection)

  return (
    <div className={MOBILE_PAGE_ROOT_CLASS}>
      <PageHeader
        title="Settings"
        description={
          isAdmin
            ? 'Manage your profile, company preferences, billing, and notifications.'
            : 'Manage your profile and personal preferences.'
        }
        size="compact"
      />

      <MainPageCard className="min-h-0 flex-1 overflow-hidden p-0">
        <div
          className={`flex min-h-0 flex-1 flex-col lg:flex-row ${MOBILE_NATURAL_HEIGHT_CLASS}`}
        >
          <div className="shrink-0 space-y-2 border-b p-4 lg:hidden">
            <Select
              value={activeSection}
              onValueChange={(value) => setActiveSection(value as SettingsSectionId)}
            >
              <SelectTrigger className={MOBILE_SELECT_TRIGGER_CLASS}>
                <SelectValue placeholder="Choose a section" />
              </SelectTrigger>
              <SelectContent>
                {visibleSections.map((section) => (
                  <SelectItem
                    key={section.id}
                    value={section.id}
                    disabled={section.id === 'integrations' && integrationsLocked}
                  >
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeMeta ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {activeMeta.description}
              </p>
            ) : null}
          </div>

          <aside className="hidden shrink-0 border-b lg:flex lg:w-72 lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-r xl:w-80">
            <ScrollArea className="w-full lg:min-h-0 lg:flex-1" viewportClassName="scroll-fade">
              <TooltipProvider>
                <nav className="flex flex-col gap-1.5 p-4">
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

          <div
            className={cn(
              'min-h-0 flex-1',
              MOBILE_NATURAL_HEIGHT_CLASS,
              activeSection !== 'invoice-template' || !isAdmin ? 'hidden' : 'flex flex-col'
            )}
          >
            {visitedSections.has('invoice-template') && isAdmin ? (
              <MainPageCardScroll contentClassName="max-w-none p-4 sm:p-6 lg:p-8">
                <DocumentTemplateEditor />
              </MainPageCardScroll>
            ) : null}
          </div>

          <div
            className={cn(
              'min-h-0 flex-1',
              MOBILE_NATURAL_HEIGHT_CLASS,
              activeSection !== 'contract-templates' || !isAdmin ? 'hidden' : 'flex flex-col'
            )}
          >
            {visitedSections.has('contract-templates') && isAdmin ? (
              <MainPageCardScroll contentClassName="max-w-none p-4 sm:p-6 lg:p-8">
                <ContractTemplatesSettings />
              </MainPageCardScroll>
            ) : null}
          </div>

          <div
            className={cn(
              'min-h-0 flex-1',
              MOBILE_NATURAL_HEIGHT_CLASS,
              (activeSection === 'invoice-template' || activeSection === 'contract-templates') &&
                isAdmin
                ? 'hidden'
                : 'flex flex-col'
            )}
          >
            <MainPageCardScroll contentClassName={cn('max-w-4xl p-4 sm:p-6 lg:p-8')}>
              <div className="relative min-h-[280px]">
                {isSectionTransitioning ? <SettingsSectionLoadingOverlay /> : null}

                {visitedSections.has('profile') ? (
                  <div hidden={activeSection !== 'profile'}>
                    <UserProfileSettings
                      fullName={fullName}
                      email={email}
                      avatarUrl={avatarUrl}
                      roleLabel={roleLabel}
                      onFullNameChange={setFullName}
                    />
                  </div>
                ) : null}

                {visitedSections.has('sign-in') ? (
                  <div hidden={activeSection !== 'sign-in'}>
                    <UserSignInSettings
                      fullName={fullName}
                      email={email}
                      onSaved={({ fullName: savedName, email: savedEmail }) => {
                        setFullName(savedName)
                        setEmail(savedEmail)
                      }}
                    />
                  </div>
                ) : null}

                {visitedSections.has('appearance') ? (
                  <div hidden={activeSection !== 'appearance'} className="space-y-6 max-w-2xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Appearance</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Your theme is personal. Company look (colors and background) is shared with
                        your team and the client portal.
                      </p>
                    </div>
                    <AppearanceSettings embedded canEditCompanyBranding={isAdmin} />
                  </div>
                ) : null}

                {visitedSections.has('company') && isAdmin ? (
                  <div hidden={activeSection !== 'company'} className="space-y-6">
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
                ) : null}

                {visitedSections.has('billing') && isAdmin ? (
                  <div hidden={activeSection !== 'billing'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Client payments</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Connect Stripe to enable invoicing and client payments. Set company-wide
                        deposit and installment defaults below.
                      </p>
                    </div>
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <StripeConnectSettings embedded />
                    </Suspense>
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <CompanyJobPaymentSettings />
                    </Suspense>
                  </div>
                ) : null}

                {visitedSections.has('subscription') && isAdmin ? (
                  <div hidden={activeSection !== 'subscription'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">
                        Platform subscription
                      </h2>
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
                ) : null}

                {visitedSections.has('job-photos') && isAdmin ? (
                  <div hidden={activeSection !== 'job-photos'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Job photo categories</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Custom categories and order for job site photo uploads.
                      </p>
                    </div>
                    {photoStorage && (
                      <PhotoStorageMeter
                        usedLabel={photoStorage.usedLabel}
                        limitLabel={photoStorage.limitLabel}
                        usedBytes={photoStorage.usedBytes}
                        limitBytes={photoStorage.limitBytes}
                      />
                    )}
                    <JobPhotoCategoriesSettings embedded />
                  </div>
                ) : null}

                {visitedSections.has('service-packages') && isAdmin ? (
                  <div hidden={activeSection !== 'service-packages'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Service packages</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Define the services you offer once, then reuse them across booking and job
                        creation.
                      </p>
                    </div>
                    <ServicePackagesSettings embedded />
                  </div>
                ) : null}

                {visitedSections.has('client-booking') && isAdmin ? (
                  <div hidden={activeSection !== 'client-booking'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Client booking</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Let clients book online or submit a request through your public link.
                      </p>
                    </div>
                    <ClientBookingSettings embedded />
                  </div>
                ) : null}

                {visitedSections.has('notifications') && isAdmin ? (
                  <div hidden={activeSection !== 'notifications'} className="space-y-6 max-w-3xl">
                    <NotificationSettings embedded />
                  </div>
                ) : null}

                {visitedSections.has('integrations') && isAdmin ? (
                  <div hidden={activeSection !== 'integrations'} className="space-y-6 max-w-3xl">
                    <div>
                      <h2 className="text-xl font-semibold tracking-tight">Integrations</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Connect accounting, calendar, and automation tools.
                      </p>
                    </div>
                    <IntegrationsSettings />
                  </div>
                ) : null}

                {activeMeta ? (
                  <p className="sr-only">Viewing {activeMeta.label} settings</p>
                ) : null}
              </div>
            </MainPageCardScroll>
          </div>
        </div>
      </MainPageCard>
    </div>
  )
}

export function SettingsPageClient({
  initialData,
}: {
  initialData: SettingsPageInitialData
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-col p-6">
          <PageLoadingSkeleton />
        </div>
      }
    >
      <SettingsPageContent initialData={initialData} />
    </Suspense>
  )
}