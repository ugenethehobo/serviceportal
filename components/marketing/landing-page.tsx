'use client'

import { useState } from 'react'
import { LandingHero } from '@/components/marketing/landing-hero'
import { LandingHeroSlideshow } from '@/components/marketing/landing-hero-slideshow'
import { LandingMarquee } from '@/components/marketing/landing-marquee'
import { LandingNav } from '@/components/marketing/landing-nav'
import { LandingPricingBand } from '@/components/marketing/landing-pricing-band'
import { LandingProductJourney } from '@/components/marketing/landing-product-journey'
import { LandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import {
  LANDING_BACKGROUND_PHOTOS_ENABLED,
  LANDING_FEATURE_SECTIONS,
  LANDING_SLIDESHOW_SLIDES,
  SERVICE_PORTAL_VERSION,
} from '@/lib/landing-page-config'
import type { PlatformPlanPricing } from '@/lib/platform-pricing'
import { cn } from '@/lib/utils'

interface LandingPageProps {
  plans: PlatformPlanPricing[]
}

export function LandingPage({ plans }: LandingPageProps) {
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const usePhotoBackground = LANDING_BACKGROUND_PHOTOS_ENABLED

  return (
    <div
      className={cn(
        'landing-editorial relative h-dvh w-full overflow-hidden',
        !usePhotoBackground && 'bg-[#F2EDE4] text-[#0A0A0A]'
      )}
    >
      {usePhotoBackground && (
        <div className="fixed inset-0 z-0" aria-hidden>
          <LandingHeroSlideshow
            slides={LANDING_SLIDESHOW_SLIDES}
            activeIndex={activeSlideIndex}
            onActiveIndexChange={setActiveSlideIndex}
          />
        </div>
      )}

      <LandingNav photoBackground={usePhotoBackground} />

      <LandingScrollRoot>
        <div
          className={cn(
            'relative min-h-full',
            !usePhotoBackground && 'landing-grain'
          )}
        >
          <LandingHero photoBackground={usePhotoBackground} />
          <LandingMarquee />
          <LandingProductJourney sections={LANDING_FEATURE_SECTIONS} />
          <LandingPricingBand plans={plans} />

          <footer
            className={cn(
              'border-t px-4 py-10 text-center sm:px-6',
              usePhotoBackground
                ? 'border-white/10 bg-[#F2EDE4] text-black/45'
                : 'border-black/8 text-black/45'
            )}
          >
            <p className="text-sm">
              © {new Date().getFullYear()} ServicePortal · Built for field service operators
            </p>
            <p className="mt-1 font-mono text-xs text-black/30">
              v{SERVICE_PORTAL_VERSION} · Beta
            </p>
          </footer>
        </div>
      </LandingScrollRoot>
    </div>
  )
}