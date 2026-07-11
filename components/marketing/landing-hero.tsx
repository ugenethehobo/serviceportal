'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BetaAccessRequestDialog } from '@/components/marketing/beta-access-request-dialog'
import { LandingScrollReveal } from '@/components/marketing/landing-scroll-reveal'
import { Button } from '@/components/ui/button'
import { LANDING_HERO } from '@/lib/landing-page-config'
import { PLATFORM_TRIAL_DAYS } from '@/lib/platform-pricing'
import { isBetaReleaseMode, type PlatformReleaseMode } from '@/lib/platform-settings'
import { cn } from '@/lib/utils'

type LandingHeroProps = {
  photoBackground?: boolean
  releaseMode: PlatformReleaseMode
}

export function LandingHero({ photoBackground = false, releaseMode }: LandingHeroProps) {
  const isBeta = isBetaReleaseMode(releaseMode)
  const [requestOpen, setRequestOpen] = useState(false)

  return (
    <section
      id="landing-hero"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-4 sm:px-6"
    >
      {!photoBackground && (
        <>
          <div
            className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-[#FF4F00]/10 blur-[100px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-16 bottom-0 h-64 w-64 rounded-full bg-[#1A56FF]/8 blur-[90px]"
            aria-hidden
          />
        </>
      )}

      <LandingScrollReveal className="relative mx-auto w-full max-w-4xl text-center">
        <p
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] font-semibold tracking-[0.2em] uppercase backdrop-blur-sm',
            isBeta
              ? photoBackground
                ? 'border border-white/25 bg-white/10 text-[#FF4F00]'
                : 'border border-black/10 bg-white/70 text-[#FF4F00]'
              : photoBackground
                ? 'border border-white/20 bg-white/10 text-white/75'
                : 'border border-black/10 bg-white/70 text-black/55'
          )}
        >
          {isBeta && (
            <span
              className={cn(
                'size-1.5 rounded-full motion-safe:animate-pulse bg-[#FF4F00]'
              )}
            />
          )}
          {isBeta ? LANDING_HERO.eyebrowBeta : LANDING_HERO.eyebrowRelease}
        </p>

        <h1
          className={cn(
            'mt-6 text-[2.75rem] font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-[4.5rem]',
            photoBackground ? 'text-white' : 'text-[#0A0A0A]'
          )}
        >
          <span className="block">{LANDING_HERO.headline[0]}</span>
          <span
            className={cn('mt-1 block', photoBackground ? 'text-white/55' : 'text-black/30')}
          >
            {LANDING_HERO.headline[1]}
          </span>
        </h1>

        <p
          className={cn(
            'mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg',
            photoBackground ? 'text-white/80' : 'text-black/55'
          )}
        >
          {LANDING_HERO.subheadline}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {isBeta ? (
            <>
              <Button
                size="lg"
                className={cn(
                  'h-12 w-full rounded-full px-8 text-base font-semibold sm:w-auto',
                  photoBackground
                    ? 'bg-white text-slate-950 hover:bg-white/90'
                    : 'bg-[#0A0A0A] text-white hover:bg-black/85'
                )}
                onClick={() => setRequestOpen(true)}
              >
                Request beta access
              </Button>
              <Link href="/signup">
                <Button
                  size="lg"
                  variant="outline"
                  className={cn(
                    'h-12 w-full rounded-full px-8 text-base backdrop-blur-sm sm:w-auto',
                    photoBackground
                      ? 'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white'
                      : 'border-black/15 bg-white/60 text-[#0A0A0A] hover:bg-white'
                  )}
                >
                  Enter beta code
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/signup?plan=trial">
                <Button
                  size="lg"
                  className={cn(
                    'h-12 w-full rounded-full px-8 text-base font-semibold sm:w-auto',
                    photoBackground
                      ? 'bg-white text-slate-950 hover:bg-white/90'
                      : 'bg-[#0A0A0A] text-white hover:bg-black/85'
                  )}
                >
                  Start {PLATFORM_TRIAL_DAYS}-day trial
                </Button>
              </Link>
              <a href="#features">
                <Button
                  size="lg"
                  variant="outline"
                  className={cn(
                    'h-12 w-full rounded-full px-8 text-base backdrop-blur-sm sm:w-auto',
                    photoBackground
                      ? 'border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white'
                      : 'border-black/15 bg-white/60 text-[#0A0A0A] hover:bg-white'
                  )}
                >
                  Tour the product
                </Button>
              </a>
            </>
          )}
        </div>
      </LandingScrollReveal>

      {isBeta && (
        <BetaAccessRequestDialog open={requestOpen} onOpenChange={setRequestOpen} />
      )}
    </section>
  )
}