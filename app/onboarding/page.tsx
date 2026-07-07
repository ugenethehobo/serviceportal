import { redirect } from 'next/navigation'
import {
  getOnboardingInitialDataAction,
  getOnboardingStatusAction,
} from '@/app/onboarding-actions'
import { OnboardingWizard } from '@/components/dashboard/onboarding/onboarding-wizard'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const statusResult = await getOnboardingStatusAction()

  if (!statusResult.success) {
    redirect('/login')
  }

  if (statusResult.completed) {
    redirect('/dashboard')
  }

  const dataResult = await getOnboardingInitialDataAction()

  if (!dataResult.success) {
    redirect('/login')
  }

  return <OnboardingWizard initialData={dataResult} />
}