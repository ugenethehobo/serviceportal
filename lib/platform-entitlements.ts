import {
  PLATFORM_SEAT_LIMITS,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import { getPhotoStorageLimitForPlan } from '@/lib/job-photo-storage'

export type PlatformFeature = 'routes' | 'reports' | 'integrations'

export const PLATFORM_CREW_LIMITS: Record<PlatformPlanId, number | null> = {
  trial: 2,
  basic: 5,
  pro: null,
}

export type PlanEntitlements = {
  plan: PlatformPlanId
  seatLimit: number
  crewLimit: number | null
  photoStorageBytes: number
  routes: boolean
  reports: boolean
  integrations: boolean
}

const FEATURE_MIN_PLAN: Record<PlatformFeature, PlatformPlanId> = {
  routes: 'pro',
  reports: 'basic',
  integrations: 'pro',
}

const PLAN_RANK: Record<PlatformPlanId, number> = {
  trial: 0,
  basic: 1,
  pro: 2,
}

export function getCrewLimitForPlan(plan: PlatformPlanId): number | null {
  return PLATFORM_CREW_LIMITS[plan]
}

export function getPlanEntitlements(plan: PlatformPlanId): PlanEntitlements {
  return {
    plan,
    seatLimit: PLATFORM_SEAT_LIMITS[plan],
    crewLimit: PLATFORM_CREW_LIMITS[plan],
    photoStorageBytes: getPhotoStorageLimitForPlan(plan),
    routes: plan === 'pro',
    reports: plan === 'basic' || plan === 'pro',
    integrations: plan === 'pro',
  }
}

export function planMeetsMinimum(
  plan: PlatformPlanId,
  minimumPlan: PlatformPlanId
): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[minimumPlan]
}

export function canAccessPlatformFeature(
  plan: PlatformPlanId,
  feature: PlatformFeature
): boolean {
  return planMeetsMinimum(plan, FEATURE_MIN_PLAN[feature])
}

export function getPlatformFeatureUpgradeMessage(feature: PlatformFeature): string {
  const minimum = FEATURE_MIN_PLAN[feature]
  const label = minimum === 'pro' ? 'Pro' : 'Basic'
  const names: Record<PlatformFeature, string> = {
    routes: 'Route planner',
    reports: 'Reports',
    integrations: 'Integrations',
  }
  return `${names[feature]} requires a ${label} plan or higher. Upgrade in Settings → Subscription.`
}

export function getCrewLimitMessage(plan: PlatformPlanId, limit: number): string {
  const planLabel =
    plan === 'pro' ? 'Pro' : plan === 'basic' ? 'Basic' : 'Free Trial'
  return `Your ${planLabel} plan includes up to ${limit} crews. Upgrade to add more.`
}

export function getSeatLimitMessage(plan: PlatformPlanId, limit: number): string {
  const planLabel =
    plan === 'pro' ? 'Pro' : plan === 'basic' ? 'Basic' : 'Free Trial'
  return `Your ${planLabel} plan includes up to ${limit} team seats. Upgrade in Settings → Subscription to add more.`
}

export function isDashboardPathAllowed(
  pathname: string,
  plan: PlatformPlanId,
  searchParams?: { get(key: string): string | null }
): boolean {
  if (pathname.startsWith('/dashboard/routes')) {
    return canAccessPlatformFeature(plan, 'routes')
  }
  if (pathname.startsWith('/dashboard/reports')) {
    return canAccessPlatformFeature(plan, 'reports')
  }
  if (
    pathname.startsWith('/dashboard/settings') &&
    searchParams?.get('section') === 'integrations'
  ) {
    return canAccessPlatformFeature(plan, 'integrations')
  }
  return true
}