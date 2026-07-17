export type SettingsSectionId =
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

export type SettingsNavSection = {
  id: SettingsSectionId
  label: string
  description: string
  adminOnly?: boolean
  keywords?: string[]
}

export const SETTINGS_NAV_SECTIONS: SettingsNavSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Your name and profile photo.',
    keywords: ['account', 'name', 'avatar', 'photo'],
  },
  {
    id: 'sign-in',
    label: 'Sign in',
    description: 'Email and password.',
    keywords: ['password', 'email', 'login', 'security'],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, background, and accent color.',
    keywords: ['theme', 'dark mode', 'background', 'accent', 'color', 'branding'],
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Branding, location, and hours.',
    keywords: ['business', 'hours', 'logo', 'address', 'location', 'timezone'],
    adminOnly: true,
  },
  {
    id: 'billing',
    label: 'Payments',
    description: 'Stripe Connect for client payments.',
    keywords: ['stripe', 'connect', 'payouts', 'bank'],
    adminOnly: true,
  },
  {
    id: 'subscription',
    label: 'Subscription',
    description: 'Your platform plan and billing.',
    keywords: ['plan', 'trial', 'upgrade', 'invoice'],
    adminOnly: true,
  },
  {
    id: 'invoice-template',
    label: 'Document templates',
    description: 'Invoice and estimate PDF layouts.',
    keywords: ['invoice', 'estimate', 'pdf', 'template', 'documents'],
    adminOnly: true,
  },
  {
    id: 'contract-templates',
    label: 'Contract templates',
    description: 'Service agreements with signing fields.',
    keywords: ['contract', 'agreement', 'signing', 'e-sign'],
    adminOnly: true,
  },
  {
    id: 'job-photos',
    label: 'Job photos',
    description: 'Photo upload categories.',
    keywords: ['photos', 'images', 'categories', 'camera'],
    adminOnly: true,
  },
  {
    id: 'service-packages',
    label: 'Service packages',
    description: 'Reusable services for booking and jobs.',
    keywords: ['services', 'packages', 'pricing', 'booking'],
    adminOnly: true,
  },
  {
    id: 'client-booking',
    label: 'Client booking',
    description: 'Public booking link and intake mode.',
    keywords: ['booking', 'public link', 'intake', 'schedule online'],
    adminOnly: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Email and SMS alerts.',
    keywords: ['email', 'sms', 'reminders', 'alerts'],
    adminOnly: true,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'QuickBooks, Google Calendar, Zapier.',
    keywords: ['quickbooks', 'google calendar', 'zapier', 'sync'],
    adminOnly: true,
  },
]

export function getVisibleSettingsNavSections(role: string | undefined) {
  const isAdmin = role === 'company_admin'
  return SETTINGS_NAV_SECTIONS.filter((section) => !section.adminOnly || isAdmin)
}

export function resolveSettingsSectionId(
  requested: SettingsSectionId | null,
  role: string | undefined
): SettingsSectionId {
  const visible = getVisibleSettingsNavSections(role)
  if (requested && visible.some((section) => section.id === requested)) {
    return requested
  }
  return visible[0]?.id ?? 'profile'
}