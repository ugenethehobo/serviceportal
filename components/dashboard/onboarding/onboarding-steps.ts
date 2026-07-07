import {
  Building2,
  CalendarClock,
  CreditCard,
  Layers3,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

export type OnboardingStepId =
  | 'profile'
  | 'company'
  | 'payments'
  | 'packages'
  | 'booking'

export type OnboardingStep = {
  id: OnboardingStepId
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
  skippable?: boolean
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'profile',
    label: 'Profile',
    shortLabel: 'Profile',
    description: 'Add your photo, display name, and choose light or dark mode.',
    icon: UserRound,
  },
  {
    id: 'company',
    label: 'Company',
    shortLabel: 'Company',
    description: 'Set your branding, office address, scheduling, and business mode.',
    icon: Building2,
  },
  {
    id: 'payments',
    label: 'Payments',
    shortLabel: 'Payments',
    description: 'Connect Stripe to accept client payments. You can finish this later.',
    icon: CreditCard,
    skippable: true,
  },
  {
    id: 'packages',
    label: 'Service packages',
    shortLabel: 'Packages',
    description: 'Define the services you offer for booking and job templates.',
    icon: Layers3,
  },
  {
    id: 'booking',
    label: 'Client booking',
    shortLabel: 'Booking',
    description: 'Choose how clients request or book services online.',
    icon: CalendarClock,
  },
]

export function getOnboardingStepIndex(stepId: OnboardingStepId) {
  return ONBOARDING_STEPS.findIndex((step) => step.id === stepId)
}

export function getOnboardingProgressPercent(stepId: OnboardingStepId) {
  const index = getOnboardingStepIndex(stepId)
  if (index < 0) return 0
  return Math.round(((index + 1) / ONBOARDING_STEPS.length) * 100)
}