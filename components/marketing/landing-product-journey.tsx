'use client'

import { LandingProductStage } from '@/components/marketing/landing-product-frame'
import { LandingScrollReveal } from '@/components/marketing/landing-scroll-reveal'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import { Card, CardContent } from '@/components/ui/card'
import { useLandingChapterScroll } from '@/hooks/use-landing-chapter-scroll'
import {
  LANDING_CHAPTER_PANEL_CARD_CLASS,
  LANDING_CHAPTER_PANEL_CLASS,
  LANDING_CHAPTER_SCROLL_STEP_DESKTOP_CLASS,
  LANDING_CHAPTER_SCROLL_STEP_MOBILE_CLASS,
  LANDING_PRODUCT_IMAGE_COLUMN_CLASS,
  LANDING_PRODUCT_MOBILE_CONTAINER_CLASS,
  LANDING_PRODUCT_MOBILE_IMAGE_ASPECT,
  LANDING_PRODUCT_MOBILE_IMAGE_SIZES,
  LANDING_PRODUCT_MOBILE_STAGE_CLASS,
  LANDING_PRODUCT_TOUR_DESKTOP_CLASS,
  LANDING_PRODUCT_TOUR_PAIR_CLASS,
} from '@/lib/landing-product-display'
import { resolveLandingProductImage } from '@/lib/landing-product-images'
import type { LandingFeatureSection } from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'
import { ArrowRight } from 'lucide-react'

type LandingProductJourneyProps = {
  sections: LandingFeatureSection[]
}

function ChapterCopy({
  section,
  index,
  className,
  fillHeight = false,
}: {
  section: LandingFeatureSection
  index: number
  className?: string
  fillHeight?: boolean
}) {
  return (
    <Card
      className={cn(
        LANDING_CHAPTER_PANEL_CARD_CLASS,
        fillHeight && 'h-full',
        className
      )}
    >
      <CardContent className="flex flex-1 flex-col overflow-y-auto py-4">
        <p className="font-mono text-xs tracking-[0.2em] text-[#FF4F00] uppercase">
          {String(index + 1).padStart(2, '0')}
        </p>
        <h3 className="mt-2 text-lg font-bold tracking-tight text-foreground sm:text-xl lg:text-2xl">
          {section.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:mt-3">
          {section.description}
        </p>
        <ul className="mt-3 space-y-2 sm:mt-4">
          {section.bullets.slice(0, 3).map((bullet) => (
            <li key={bullet} className="flex items-start gap-2 text-xs text-foreground/80 sm:gap-3 sm:text-sm">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-[#FF4F00] sm:size-4" />
              {bullet}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function ChapterCopyStack({
  sections,
  activeIndex,
  className,
  fillHeight = false,
}: {
  sections: LandingFeatureSection[]
  activeIndex: number
  className?: string
  fillHeight?: boolean
}) {
  return (
    <div className={cn('relative w-full', fillHeight && 'h-full min-h-0', className)}>
      {sections.map((section, index) => {
        const isActive = index === activeIndex

        return (
          <div
            key={section.id}
            className={cn(
              'w-full transition-opacity duration-700 ease-out motion-reduce:transition-none',
              fillHeight && 'h-full',
              isActive
                ? 'relative z-10 opacity-100'
                : 'pointer-events-none absolute inset-0 z-0 opacity-0'
            )}
          >
            <ChapterCopy
              section={section}
              index={index}
              fillHeight={fillHeight}
              className={fillHeight ? 'h-full' : undefined}
            />
          </div>
        )
      })}
    </div>
  )
}

function ChapterNav({
  sections,
  activeIndex,
  onSelect,
  className,
}: {
  sections: LandingFeatureSection[]
  activeIndex: number
  onSelect: (index: number) => void
  className?: string
}) {
  return (
    <nav aria-label="Product tour chapters" className={cn('w-full', className)}>
      <ul className="flex flex-wrap justify-center gap-2">
        {sections.map((section, index) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3 py-2 text-left transition-all sm:px-4',
                index === activeIndex
                  ? 'bg-foreground text-background shadow-lg'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <span className="font-mono text-[10px] tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="text-sm font-medium">{section.eyebrow}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ProductTourPair({
  sections,
  activeIndex,
  productItems,
  chapterPanelClassName,
  imageClassName,
}: {
  sections: LandingFeatureSection[]
  activeIndex: number
  productItems: Array<{ src: string; alt: string }>
  chapterPanelClassName?: string
  imageClassName?: string
}) {
  return (
    <div className={LANDING_PRODUCT_TOUR_PAIR_CLASS}>
      <aside className={cn(LANDING_CHAPTER_PANEL_CLASS, chapterPanelClassName)}>
        <ChapterCopyStack
          sections={sections}
          activeIndex={activeIndex}
          fillHeight
        />
      </aside>
      <LandingProductStage
        items={productItems}
        activeIndex={activeIndex}
        className={cn(LANDING_PRODUCT_IMAGE_COLUMN_CLASS, imageClassName)}
      />
    </div>
  )
}

function MobileTourStage({
  sections,
  activeIndex,
  mobileProductItems,
}: {
  sections: LandingFeatureSection[]
  activeIndex: number
  mobileProductItems: Array<{ src: string; alt: string }>
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      <ChapterCopyStack sections={sections} activeIndex={activeIndex} />
      <LandingProductStage
        items={mobileProductItems}
        activeIndex={activeIndex}
        aspectRatio={LANDING_PRODUCT_MOBILE_IMAGE_ASPECT}
        sizes={LANDING_PRODUCT_MOBILE_IMAGE_SIZES}
        className={LANDING_PRODUCT_MOBILE_STAGE_CLASS}
      />
    </div>
  )
}

export function LandingProductJourney({ sections }: LandingProductJourneyProps) {
  const scrollRoot = useLandingScrollRoot()
  const sectionIds = sections.map((section) => section.id)
  const activeIndex = useLandingChapterScroll({ sectionIds })

  const productItems = sections.map((section) => {
    const image = resolveLandingProductImage(section, 'desktop')
    return { src: image.src, alt: image.alt }
  })

  const mobileProductItems = sections.map((section) => {
    const image = resolveLandingProductImage(section, 'mobile')
    return { src: image.src, alt: image.alt }
  })

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
        <LandingScrollReveal className="mx-auto max-w-6xl text-center">
          <p className="font-mono text-xs font-semibold tracking-[0.25em] text-[#FF4F00] uppercase">
            Product tour
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Six chapters. One platform.
            <span className="block text-muted-foreground">
              Scroll to explore each capability.
            </span>
          </h2>
        </LandingScrollReveal>
      </div>

      {/* Desktop: centered nav + sticky chapter panel beside product image */}
      <div className="hidden px-4 pb-24 sm:px-6 lg:block xl:px-10">
        <div className={cn('relative', LANDING_PRODUCT_TOUR_DESKTOP_CLASS)}>
          <div className="grid grid-cols-1">
            <div className="sticky top-28 col-start-1 row-start-1 z-10 flex w-full flex-col items-center gap-5 self-start">
              <ChapterNav
                sections={sections}
                activeIndex={activeIndex}
                onSelect={scrollToChapter}
              />
              <ProductTourPair
                sections={sections}
                activeIndex={activeIndex}
                productItems={productItems}
              />
            </div>

            <div className="col-start-1 row-start-1 z-0 flex w-full flex-col">
              {sections.map((section, index) => (
                <article
                  key={section.id}
                  data-landing-chapter-desktop={section.id}
                  aria-label={`Chapter ${index + 1}: ${section.eyebrow}`}
                  className={LANDING_CHAPTER_SCROLL_STEP_DESKTOP_CLASS}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: sticky stage — one chapter + mobile screenshot at a time */}
      <div className="px-4 pb-16 sm:px-6 sm:pb-24 lg:hidden">
        <div className={LANDING_PRODUCT_MOBILE_CONTAINER_CLASS}>
          <div className="grid grid-cols-1">
            <div className="sticky top-20 col-start-1 row-start-1 z-10 flex w-full flex-col items-center gap-4 self-start sm:top-24">
              <ChapterNav
                sections={sections}
                activeIndex={activeIndex}
                onSelect={scrollToChapter}
              />
              <MobileTourStage
                sections={sections}
                activeIndex={activeIndex}
                mobileProductItems={mobileProductItems}
              />
            </div>

            <div className="col-start-1 row-start-1 z-0 flex w-full flex-col">
              {sections.map((section, index) => (
                <article
                  key={section.id}
                  data-landing-chapter-mobile={section.id}
                  aria-label={`Chapter ${index + 1}: ${section.eyebrow}`}
                  className={LANDING_CHAPTER_SCROLL_STEP_MOBILE_CLASS}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-center gap-2">
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
    </section>
  )
}
