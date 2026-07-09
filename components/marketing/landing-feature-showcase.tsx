'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { LandingHeroProductCard } from '@/components/marketing/landing-hero-product-card'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import type { LandingFeatureSection, LandingSlide } from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

function ParallaxFeatureMedia({
  section,
  className,
}: {
  section: LandingFeatureSection
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollRoot = useLandingScrollRoot()
  const [offsetY, setOffsetY] = useState(0)
  const isRaster = /\.(png|jpe?g|webp)$/i.test(section.image.src)

  useEffect(() => {
    const element = ref.current
    const root = scrollRoot
    if (!element || !root) return

    const updateOffset = () => {
      const rect = element.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      const viewportCenter = rootRect.top + rootRect.height / 2
      const elementCenter = rect.top + rect.height / 2
      const distance = elementCenter - viewportCenter
      setOffsetY(distance * -0.06)
    }

    updateOffset()
    root.addEventListener('scroll', updateOffset, { passive: true })
    window.addEventListener('resize', updateOffset)
    return () => {
      root.removeEventListener('scroll', updateOffset)
      window.removeEventListener('resize', updateOffset)
    }
  }, [scrollRoot])

  return (
    <div
      ref={ref}
      className={cn(
        'relative mx-auto w-full max-w-lg will-change-transform lg:max-w-none',
        className
      )}
      style={{ transform: `translate3d(0, ${offsetY}px, 0)` }}
    >
      <div className="rounded-2xl border border-white/15 bg-white/10 p-2 shadow-2xl shadow-black/35 backdrop-blur-md">
        <div className="relative aspect-[5/3] overflow-hidden rounded-xl bg-slate-950/50">
          <Image
            src={section.image.src}
            alt={section.image.alt}
            fill
            quality={100}
            unoptimized={isRaster}
            sizes="(max-width: 1024px) 90vw, 520px"
            className="object-contain object-center"
          />
        </div>
      </div>
    </div>
  )
}

function FeatureSectionBlock({ section }: { section: LandingFeatureSection }) {
  const imageFirst = section.imagePosition === 'left'

  return (
    <article id={section.id} className="scroll-mt-24 py-12 sm:py-16">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 lg:grid-cols-2 lg:gap-12">
        <div className={cn(imageFirst && 'lg:order-2')}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
            {section.eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
            {section.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-base">
            {section.description}
          </p>
          <ul className="mt-4 space-y-2">
            {section.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2.5 text-sm text-white/80">
                <Check className="mt-0.5 size-4 shrink-0 text-amber-300" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <ParallaxFeatureMedia section={section} className={cn(imageFirst && 'lg:order-1')} />
      </div>
    </article>
  )
}

export function LandingFeatureShowcase({
  sections,
  slides,
  activeSlideIndex,
  onSlideIndexChange,
}: {
  sections: LandingFeatureSection[]
  slides: LandingSlide[]
  activeSlideIndex: number
  onSlideIndexChange: (index: number) => void
}) {
  return (
    <section id="features" className="relative scroll-mt-20 pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4 pt-12 text-center sm:pt-16">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          See it in action
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 sm:text-base">
          A quick tour of scheduling, client management, and field operations.
        </p>

        <div className="mx-auto mt-8 max-w-3xl">
          <LandingHeroProductCard slides={slides} activeIndex={activeSlideIndex} />
          {slides.length > 1 && (
            <div
              className="mt-4 flex items-center justify-center gap-2"
              role="tablist"
              aria-label="Product preview slides"
            >
              {slides.map((slide, index) => (
                <button
                  key={`feature-dot-${slide.src}-${index}`}
                  type="button"
                  role="tab"
                  aria-label={`Show preview ${index + 1}`}
                  aria-selected={index === activeSlideIndex}
                  onClick={() => onSlideIndexChange(index)}
                  className={cn(
                    'h-2 rounded-full transition-all',
                    index === activeSlideIndex ? 'w-7 bg-white' : 'w-2 bg-white/45'
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 divide-y divide-white/10 sm:mt-12">
        {sections.map((section) => (
          <FeatureSectionBlock key={section.id} section={section} />
        ))}
      </div>
    </section>
  )
}