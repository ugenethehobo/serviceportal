'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getAccountSettingsAction } from '@/app/action'
import { AppearanceSettings } from '@/components/appearance-settings'
import { CompanyProfileSettings } from '@/components/dashboard/company-profile-settings'
import { JobPhotoCategoriesSettings } from '@/components/dashboard/job-photo-categories-settings'
import { NotificationSettings } from '@/components/dashboard/notification-settings'
import { StripeConnectSettings } from '@/components/dashboard/stripe-connect-settings'
import { UserProfileSettings } from '@/components/dashboard/user-profile-settings'
import { UserSignInSettings } from '@/components/dashboard/user-sign-in-settings'
import { SaveStatusBadge, type SaveStatus } from '@/components/dashboard/save-status-badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  Bell,
  Building2,
  Camera,
  CreditCard,
  KeyRound,
  Palette,
  User,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'

type SettingsSectionId =
  | 'profile'
  | 'sign-in'
  | 'appearance'
  | 'company'
  | 'billing'
  | 'job-photos'
  | 'notifications'

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
    label: 'Billing',
    description: 'Stripe and payments.',
    icon: CreditCard,
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
} | null

function SettingsSectionButton({
  section,
  isActive,
  onClick,
}: {
  section: SettingsSection
  isActive: boolean
  onClick: () => void
}) {
  const Icon = section.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="flex items-start gap-3">
        <Icon className="size-4 mt-0.5 shrink-0" />
        <span className="min-w-0">
          <span className="block text-sm font-medium">{section.label}</span>
          <span className="block text-xs opacity-80 mt-0.5">{section.description}</span>
        </span>
      </span>
    </button>
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

  const isAdmin = role === 'company_admin'

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin),
    [isAdmin]
  )

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
                address_zip
              `)
              .eq('id', profile.company_id)
              .single()

            setCompany(companyData)
          }
        }
      }

      setIsLoading(false)
    }

    loadSettings()
  }, [supabase])

  useEffect(() => {
    if (
      requestedSection &&
      !visibleSections.some((section) => section.id === requestedSection)
    ) {
      setActiveSection(visibleSections[0]?.id || 'profile')
    }
  }, [requestedSection, setActiveSection, visibleSections])

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
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 border-b px-4 py-4 sm:px-6">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? 'Manage your profile, company preferences, billing, and notifications.'
            : 'Manage your profile and personal preferences.'}
        </p>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <aside className="shrink-0 border-b lg:border-b-0 lg:border-r lg:w-72 xl:w-80">
          <ScrollArea className="w-full lg:h-full" viewportClassName="scroll-fade-x lg:scroll-fade">
            <nav className="flex lg:flex-col gap-1 p-3 min-w-max lg:min-w-0">
              {visibleSections.map((section) => (
                <SettingsSectionButton
                  key={section.id}
                  section={section}
                  isActive={activeSection === section.id}
                  onClick={() => setActiveSection(section.id)}
                />
              ))}
            </nav>
          </ScrollArea>
        </aside>

        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
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
                  <h2 className="text-xl font-semibold tracking-tight">Billing & payments</h2>
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

            {activeMeta && (
              <p className="sr-only">Viewing {activeMeta.label} settings</p>
            )}
          </div>
        </main>
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