'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { LandingHeroProductCard } from '@/components/marketing/landing-hero-product-card'
import { LandingHeroSlideshow } from '@/components/marketing/landing-hero-slideshow'
import { PricingCards } from '@/components/marketing/pricing-cards'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LANDING_SLIDESHOW_SLIDES,
  SERVICE_PORTAL_VERSION,
} from '@/lib/landing-page-config'
import { PLATFORM_TRIAL_DAYS, type PlatformPlanPricing } from '@/lib/platform-pricing'
import { cn } from '@/lib/utils'
import { Calendar, CreditCard, Users, Wrench } from 'lucide-react'

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

interface LandingPageProps {
  plans: PlatformPlanPricing[]
}

export function LandingPage({ plans }: LandingPageProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const activeCaption =
    LANDING_SLIDESHOW_SLIDES[activeSlideIndex]?.caption ??
    'Run jobs, crews, and billing in one place'

  return (
    <ScrollArea className="scroll-fade h-dvh w-full bg-background" viewportClassName="size-full">
    <div className="min-h-full bg-background">
      <section className="relative flex min-h-[100dvh] flex-col lg:min-h-screen">
        <LandingHeroSlideshow
          slides={LANDING_SLIDESHOW_SLIDES}
          activeIndex={activeSlideIndex}
          onActiveIndexChange={setActiveSlideIndex}
        />

        <header className="relative z-20 shrink-0 border-b border-white/10 bg-black/20 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:py-4">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="shrink-0 text-base font-semibold tracking-tight text-white sm:text-lg">
                ServicePortal
              </span>
              <Badge className="shrink-0 border-0 bg-amber-400 font-semibold text-amber-950 hover:bg-amber-400">
                Beta
              </Badge>
              <span className="hidden font-mono text-xs text-white/60 truncate sm:inline">
                v{SERVICE_PORTAL_VERSION}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Link href="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2.5 text-white hover:bg-white/10 hover:text-white sm:px-3"
                >
                  Sign in
                </Button>
              </Link>
              <Link href="/signup">
                <Button
                  size="sm"
                  className="h-9 bg-white px-2.5 text-slate-950 hover:bg-white/90 sm:px-3"
                >
                  <span className="hidden sm:inline">Get started</span>
                  <span className="sm:hidden">Join</span>
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-start px-4 pb-20 pt-6 sm:px-6 sm:pb-24 sm:pt-8 lg:justify-center lg:pb-28 lg:pt-10">
          <div className="mx-auto w-full max-w-6xl text-center">
            <Badge
              variant="outline"
              className="mb-4 max-w-full whitespace-normal border-amber-300/60 bg-amber-400/15 px-3 py-1 text-xs leading-snug text-amber-100 backdrop-blur-sm sm:mb-5 sm:text-sm"
            >
              Now in Beta — early access for service businesses
            </Badge>
            <h1 className="mx-auto max-w-4xl text-[1.75rem] font-bold leading-tight tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl lg:leading-[1.08]">
              Run jobs, crews, and billing in one place
            </h1>
          </div>

          <div className="mx-auto mt-6 grid w-full max-w-6xl items-center gap-6 sm:mt-8 sm:gap-8 lg:mt-10 lg:grid-cols-2 lg:gap-12">
            <div className="order-2 text-center lg:order-1 lg:text-left">
              <p className="text-base leading-relaxed text-white/85 sm:text-lg md:text-xl">
                ServicePortal helps service companies schedule work, manage clients, send invoices,
                and get paid — with a client portal your customers will actually use.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
                {activeCaption}
              </p>
            </div>

            <div className="order-1 w-full lg:order-2">
              <LandingHeroProductCard
                slides={LANDING_SLIDESHOW_SLIDES}
                activeIndex={activeSlideIndex}
              />
              {LANDING_SLIDESHOW_SLIDES.length > 1 && (
                <div
                  className="mt-4 flex items-center justify-center gap-2 lg:hidden"
                  role="tablist"
                  aria-label="Product preview slides"
                >
                  {LANDING_SLIDESHOW_SLIDES.map((slide, index) => (
                    <button
                      key={`mobile-dot-${slide.src}-${index}`}
                      type="button"
                      role="tab"
                      aria-label={`Show preview ${index + 1}`}
                      aria-selected={index === activeSlideIndex}
                      onClick={() => setActiveSlideIndex(index)}
                      className={cn(
                        'h-2.5 rounded-full transition-all',
                        index === activeSlideIndex
                          ? 'w-8 bg-white'
                          : 'w-2.5 bg-white/45'
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-stretch justify-center gap-3 sm:mt-10 sm:max-w-none sm:flex-row sm:items-center">
            <Link href="/signup?plan=trial" className="w-full sm:w-auto">
              <Button size="lg" className="w-full bg-white text-slate-950 hover:bg-white/90 sm:w-auto">
                Start {PLATFORM_TRIAL_DAYS}-day free trial
              </Button>
            </Link>
            <a href="#pricing" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white sm:w-auto"
              >
                View plans
              </Button>
            </a>
          </div>
        </div>

        <a
          href="#pricing"
          className="relative z-10 mx-auto mb-6 flex shrink-0 flex-col items-center gap-1 text-white/70 transition-colors hover:text-white sm:mb-8"
          aria-label="Scroll to pricing"
        >
          <span className="text-xs uppercase tracking-widest">Plans</span>
          <ChevronDown className="size-5 motion-safe:animate-bounce" />
        </a>
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

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge variant="secondary" className="mb-3">
            Beta pricing
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Simple, transparent pricing</h2>
          <p className="text-muted-foreground mt-2">
            Prices sync from Stripe — start with a free trial, then subscribe in-page when you&apos;re
            ready.
          </p>
        </div>

        <PricingCards plans={plans} />
      </section>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} ServicePortal. Built for service businesses.</p>
        <p className="mt-1 font-mono text-xs">
          Version {SERVICE_PORTAL_VERSION} · Beta
        </p>
      </footer>
    </div>
    </ScrollArea>
  )
}
