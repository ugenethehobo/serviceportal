'use server'

import { completePlatformSignup } from '@/lib/platform-signup-server'
import type { PlatformPlanId } from '@/lib/platform-billing'
import { getPlatformPlanPricing } from '@/lib/platform-pricing-server'
import type { PlatformPlanPricing } from '@/lib/platform-pricing'
import { validatePlatformDevPromoCode } from '@/lib/platform-promo'

export async function getPlatformPricingAction(): Promise<
  { success: true; plans: PlatformPlanPricing[] } | { success: false; error: string }
> {
  try {
    const plans = await getPlatformPlanPricing()
    return { success: true, plans }
  } catch (error: any) {
    console.error('getPlatformPricingAction error:', error)
    return { success: false, error: error.message || 'Failed to load pricing' }
  }
}

export async function validatePlatformPromoAction(
  code: string,
  plan: PlatformPlanId
): Promise<
  | { success: true; message: string }
  | { success: false; error: string }
> {
  if (plan !== 'basic' && plan !== 'pro') {
    return { success: false, error: 'Promo codes apply to paid plans only' }
  }

  const promo = validatePlatformDevPromoCode(code, plan)
  if (!promo) {
    return { success: false, error: 'Invalid promo code' }
  }

  return {
    success: true,
    message: 'Dev access granted — continue without payment.',
  }
}

export async function completePlatformSignupAction(input: {
  plan: PlatformPlanId
  companyName: string
  fullName: string
  email: string
  password: string
  checkoutSessionId?: string
  promoCode?: string
}): Promise<
  | { success: true; email: string }
  | { success: false; error: string }
> {
  try {
    if (input.plan !== 'trial' && input.plan !== 'basic' && input.plan !== 'pro') {
      return { success: false, error: 'Invalid plan selected' }
    }

    const result = await completePlatformSignup(input)
    return { success: true, email: result.email }
  } catch (error: any) {
    console.error('completePlatformSignupAction error:', error)
    return { success: false, error: error.message || 'Signup failed' }
  }
}