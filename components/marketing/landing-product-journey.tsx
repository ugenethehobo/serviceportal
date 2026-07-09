'use client'

import { useEffect, useState } from 'react'
import {
  LandingProductFrame,
  LandingProductFrameStack,
} from '@/components/marketing/landing-product-frame'
import { LandingScrollReveal } from '@/components/marketing/landing-scroll-reveal'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import type { LandingFeatureSection } from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

type LandingProductJourneyProps = {
  sections: LandingFeatureSection[]
}

function ChapterCopy({ section, index }: { section: LandingFeatureSection; index: number }) {
  return (
    <div className="max-w-xl">
      <p className="font-mono text-xs tracking-[0.2em] text-[#FF4F00] uppercase">
        Chapter {String(index + 1).padStart(2, '0')}
      </p>
      <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        {section.title}
      </h3>
      <p className="mt-4 text-base leading-relaxed text-muted-foreground">
        {section.description}
      </p>
      <ul className="mt-6 space-y-3">
        {section.bullets.slice(0, 3).map((bullet) => (
          <li key={bullet} className="flex items-start gap-3 text-sm text-foreground/80">
            <ArrowRight className="mt-0.5 size-4 shrink-0 text-[#FF4F00]" />
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function LandingProductJourney({ sections }: LandingProductJourneyProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRoot = useLandingScrollRoot()

  useEffect(() => {
    if (!scrollRoot) return

    const media = window.matchMedia('(min-width: 1024px)')
    let observers: IntersectionObserver[] = []

    const bindObservers = () => {
      observers.forEach((o) => o.disconnect())
      observers = []

      const attr = media.matches ? 'data-landing-chapter-desktop' : 'data-landing-chapter-mobile'

      sections.forEach((section, index) => {
        const el = scrollRoot.querySelector<HTMLElement>(`[${attr}="${section.id}"]`)
        if (!el) return

        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting) setActiveIndex(index)
          },
          { root: scrollRoot, threshold: 0.5, rootMargin: '-15% 0px -15% 0px' }
        )
        observer.observe(el)
        observers.push(observer)
      })
    }

    bindObservers()
    media.addEventListener('change', bindObservers)
    return () => {
      media.removeEventListener('change', bindObservers)
      observers.forEach((o) => o.disconnect())
    }
  }, [scrollRoot, sections])

  const productItems = sections.map((s) => ({ src: s.image.src, alt: s.image.alt }))
  const activeSection = sections[activeIndex] ?? sections[0]

  const scrollToChapter = (index: number) => {
    const section = sections[index]
    if (!section || !scrollRoot) return
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches
    const attr = isDesktop ? 'data-landing-chapter-desktop' : 'data-landing-chapter-mobile'
    const node = scrollRoot.querySelector<HTMLElement>(`[${attr}="${section.id}"]`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <section id="features" className="dark relative scroll-mt-24 bg-background text-foreground">
      <div className="border-t border-border px-4 py-14 sm:px-6 sm:py-20">
        <LandingScrollReveal className="mx-auto max-w-6xl">
          <p className="font-mono text-xs font-semibold tracking-[0.25em] text-[#FF4F00] uppercase">
            Product tour
          </p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Six chapters. One platform.
            <span className="block text-muted-foreground">
              Scroll to explore each capability.
            </span>
          </h2>
        </LandingScrollReveal>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-16 lg:px-6 lg:pb-24">
        <div className="hidden lg:grid lg:grid-cols-[200px_minmax(0,1fr)_minmax(280px,420px)] lg:gap-x-12 lg:gap-y-0">
          <aside className="relative">
            <div className="sticky top-28 space-y-2">
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToChapter(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
                    index === activeIndex
                      ? 'bg-foreground text-background shadow-lg'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="font-mono text-[10px] tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm font-medium">{section.eyebrow}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className="min-w-0">
            {sections.map((section, index) => (
              <article
                key={section.id}
                data-landing-chapter-desktop={section.id}
                className="flex min-h-[72vh] items-center py-12"
              >
                <ChapterCopy section={section} index={index} />
              </article>
            ))}
          </div>

          <aside className="relative">
            <div className="sticky top-28">
              <LandingProductFrameStack
                items={productItems}
                activeIndex={activeIndex}
                label={activeSection?.eyebrow}
              />
            </div>
          </aside>
        </div>

        <div className="space-y-16 lg:hidden">
          {sections.map((section, index) => (
            <article
              key={section.id}
              data-landing-chapter-mobile={section.id}
              className="scroll-mt-28"
            >
              <LandingProductFrame
                src={section.image.src}
                alt={section.image.alt}
                label={section.eyebrow}
                className="mb-8"
              />
              <ChapterCopy section={section} index={index} />
            </article>
          ))}

          <div className="flex justify-center gap-2 pt-2">
            {sections.map((section, index) => (
              <button
                key={`dot-${section.id}`}
                type="button"
                aria-label={`Chapter ${index + 1}: ${section.eyebrow}`}
                onClick={() => scrollToChapter(index)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  index === activeIndex ? 'w-7 bg-foreground' : 'w-1.5 bg-muted-foreground/40'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}