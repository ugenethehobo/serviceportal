import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export function getStripePublishableKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  if (!key) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set')
  return key
}