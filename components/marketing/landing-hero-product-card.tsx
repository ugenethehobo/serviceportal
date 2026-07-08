'use client'

import Image from 'next/image'
import type { LandingSlide } from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'

interface LandingHeroProductCardProps {
  slides: LandingSlide[]
  activeIndex: number
  className?: string
}

export function LandingHeroProductCard({
  slides,
  activeIndex,
  className,
}: LandingHeroProductCardProps) {
  if (slides.length === 0) return null

  return (
    <div className={cn('mx-auto w-full max-w-md sm:max-w-xl lg:mx-0 lg:max-w-none', className)}>
      <div className="rounded-xl border border-white/20 bg-white/10 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-md sm:rounded-2xl sm:p-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-slate-950/40 sm:aspect-[5/3] sm:rounded-xl">
          {slides.map((slide, index) => {
            const isActive = index === activeIndex
            return (
              <div
                key={`product-${slide.productImage.src}-${index}`}
                className={cn(
                  'absolute inset-0 transition-opacity duration-1000 ease-in-out motion-reduce:transition-none',
                  isActive ? 'opacity-100' : 'opacity-0'
                )}
              >
                <Image
                  src={slide.productImage.src}
                  alt={slide.productImage.alt}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 520px"
                  className="object-cover object-top"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}