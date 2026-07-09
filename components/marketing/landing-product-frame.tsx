'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'

type LandingProductFrameProps = {
  src: string
  alt: string
  label?: string
  className?: string
  tilt?: boolean
  priority?: boolean
}

export function LandingProductFrame({
  src,
  alt,
  label = 'ServicePortal',
  className,
  tilt = false,
  priority = false,
}: LandingProductFrameProps) {
  const isRaster = /\.(png|jpe?g|webp)$/i.test(src)

  return (
    <div
      className={cn(
        'landing-product-frame',
        tilt && 'landing-product-frame-tilt',
        className
      )}
    >
      <div className="landing-product-frame-chrome">
        <div className="flex items-center gap-2 border-b border-black/8 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
          </div>
          <span className="mx-auto truncate font-mono text-[10px] tracking-wide text-black/35 uppercase">
            {label}
          </span>
        </div>
        <div className="relative aspect-[5/3] overflow-hidden bg-[#FAFAF8]">
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            quality={100}
            unoptimized={isRaster}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
            className="object-contain object-center"
          />
        </div>
      </div>
    </div>
  )
}

type LandingProductFrameStackProps = {
  items: Array<{ src: string; alt: string }>
  activeIndex: number
  label?: string
  className?: string
}

export function LandingProductFrameStack({
  items,
  activeIndex,
  label,
  className,
}: LandingProductFrameStackProps) {
  if (items.length === 0) return null

  return (
    <div className={cn('landing-product-frame landing-product-frame-tilt', className)}>
      <div className="landing-product-frame-chrome">
        <div className="flex items-center gap-2 border-b border-black/8 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
          </div>
          <span className="mx-auto truncate font-mono text-[10px] tracking-wide text-black/35 uppercase">
            {label ?? 'ServicePortal'}
          </span>
        </div>
        <div className="relative aspect-[5/3] overflow-hidden bg-[#FAFAF8]">
          {items.map((item, index) => {
            const isRaster = /\.(png|jpe?g|webp)$/i.test(item.src)
            return (
              <div
                key={`${item.src}-${index}`}
                className={cn(
                  'absolute inset-0 transition-all duration-700 ease-out motion-reduce:transition-none',
                  index === activeIndex
                    ? 'scale-100 opacity-100'
                    : 'scale-[0.98] opacity-0'
                )}
              >
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  priority={index === 0}
                  quality={100}
                  unoptimized={isRaster}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
                  className="object-contain object-center"
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}