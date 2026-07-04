'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  PLATFORM_PLANS,
  PLATFORM_SEAT_LIMITS,
  PLATFORM_TRIAL_DAYS,
  type PlatformPlanId,
} from '@/lib/platform-billing'
import { Calendar, Check, CreditCard, Users, Wrench } from 'lucide-react'

const FEATURES = [
  {
    icon: Users,
    title: 'Clients & jobs',
    description: 'Schedules, crews, recurring visits, and a branded client portal.',
  },
  {
    icon: CreditCard,
    title: 'Billing built in',
    description: 'Invoices, Stripe payments, and AR aging without juggling spreadsheets.',
  },
  {
    icon: Calendar,
    title: 'Field-ready ops',
    description: 'Route planning, job photos, estimates, and team coordination.',
  },
  {
    icon: Wrench,
    title: 'Made for service companies',
    description: 'Landscaping, cleaning, HVAC, and any business that runs on appointments.',
  },
]

const PLAN_ORDER: PlatformPlanId[] = ['trial', 'basic', 'pro']

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-lg tracking-tight">ServicePortal</span>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-16 md:py-24">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-4">
            Built for field service teams
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Run jobs, crews, and billing in one place
          </h1>
          <p className="text-lg text-muted-foreground mt-4 max-w-2xl">
            ServicePortal helps service companies schedule work, manage clients, send invoices,
            and get paid — with a client portal your customers will actually use.
          </p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link href="/signup?plan=trial">
              <Button size="lg">Start {PLATFORM_TRIAL_DAYS}-day free trial</Button>
            </Link>
            <Link href="/signup">
              <Button size="lg" variant="outline">View plans</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 py-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title} className="p-5 border-0 shadow-none bg-transparent">
                <div className="rounded-lg border bg-card p-2.5 w-fit mb-3">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
              </Card>
            )
          })}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="text-muted-foreground mt-2">
            Start with a free trial, then subscribe in-page when you&apos;re ready. No redirects.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_ORDER.map((planId) => {
            const plan = PLATFORM_PLANS[planId]
            const highlighted = planId === 'basic'
            return (
              <Card
                key={planId}
                className={`p-6 flex flex-col ${highlighted ? 'border-primary shadow-md' : 'shadow-sm'}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{plan.label}</h3>
                  {planId === 'trial' && <Badge variant="outline">{PLATFORM_TRIAL_DAYS} days</Badge>}
                </div>
                <p className="text-3xl font-bold mt-4">
                  {plan.monthlyPrice === 0 ? 'Free' : `$${plan.monthlyPrice}`}
                  {plan.monthlyPrice > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">/month</span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-2 flex-1">{plan.description}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-primary" />
                    {PLATFORM_SEAT_LIMITS[planId]} team seats included
                  </li>
                </ul>
                <Link href={`/signup?plan=${planId}`} className="block mt-6">
                  <Button className="w-full" variant={highlighted ? 'default' : 'outline'}>
                    {planId === 'trial' ? 'Start free trial' : `Get ${plan.label}`}
                  </Button>
                </Link>
              </Card>
            )
          })}
        </div>
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} ServicePortal. Built for service businesses.</p>
      </footer>
    </div>
  )
}