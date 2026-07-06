import { getSettingsPageInitialDataAction } from '@/app/action'
import { SettingsPageClient } from '@/components/dashboard/settings-page-client'
import {
  normalizePlatformPlan,
  normalizeSubscriptionStatus,
} from '@/lib/platform-billing'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const result = await getSettingsPageInitialDataAction()

  if (!result.success) {
    return (
      <div className="p-6 flex flex-col h-full min-h-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        </div>
        <div className="flex-1 flex items-center justify-center rounded-xl border bg-card">
          <p className="text-sm text-muted-foreground">
            {result.error || 'Unable to load settings.'}
          </p>
        </div>
      </div>
    )
  }

  const { account, company, entitlements } = result.data

  return (
    <SettingsPageClient
      initialData={{
        role: account.role,
        fullName: account.fullName,
        email: account.email,
        avatarUrl: account.avatarUrl,
        company,
        entitlements,
        subscriptionPlan: normalizePlatformPlan(company?.subscription_plan),
        subscriptionStatus: normalizeSubscriptionStatus(company?.subscription_status),
        hasPlatformCustomer: Boolean(company?.stripe_platform_customer_id),
      }}
    />
  )
}