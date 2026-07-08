'use client'

import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import {
  LANDING_SLIDESHOW_INTERVAL_MS,
  type LandingSlide,
} from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'

interface LandingHeroSlideshowProps {
  slides: LandingSlide[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  className?: string
}

export function LandingHeroSlideshow({
  slides,
  activeIndex,
  onActiveIndexChange,
  className,
}: LandingHeroSlideshowProps) {
  const [paused, setPaused] = useState(false)

  const goTo = useCallback(
    (index: number) => {
      if (slides.length === 0) return
      onActiveIndexChange(((index % slides.length) + slides.length) % slides.length)
    },
    [slides.length, onActiveIndexChange]
  )

  const next = useCallback(() => {
    goTo(activeIndex + 1)
  }, [activeIndex, goTo])

  useEffect(() => {
    if (slides.length <= 1 || paused) return

    const timer = window.setInterval(next, LANDING_SLIDESHOW_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [slides.length, paused, next])

  if (slides.length === 0) {
    return (
      <div
        className={cn('absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950', className)}
      />
    )
  }

  return (
    <div
      className={cn('absolute inset-0 overflow-hidden', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      aria-hidden
    >
      {slides.map((slide, index) => {
        const isActive = index === activeIndex
        return (
          <div
            key={`${slide.src}-${index}`}
            className={cn(
              'absolute inset-0 transition-opacity duration-1000 ease-in-out motion-reduce:transition-none',
              isActive ? 'opacity-100' : 'opacity-0'
            )}
          >
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              priority={index === 0}
              sizes="100vw"
              className="object-cover motion-safe:animate-landing-ken-burns"
              style={{
                animationDelay: `${index * 3}s`,
              }}
            />
          </div>
        )
      })}

      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/80 md:from-black/55 md:via-black/45 md:to-black/75" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/20 to-black/45 md:from-black/35 md:via-transparent md:to-black/25" />

      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-2 lg:flex lg:bottom-32">
          {slides.map((slide, index) => (
            <button
              key={`dot-${slide.src}-${index}`}
              type="button"
              aria-label={`Show slide ${index + 1}: ${slide.alt}`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => goTo(index)}
              className={cn(
                'h-2 rounded-full transition-all',
                index === activeIndex
                  ? 'w-8 bg-white'
                  : 'w-2 bg-white/45 hover:bg-white/70'
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}