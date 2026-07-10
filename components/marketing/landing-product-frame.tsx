'use client'

import Image from 'next/image'
import { Card } from '@/components/ui/card'
import {
  LANDING_PRODUCT_IMAGE_ASPECT,
  LANDING_PRODUCT_IMAGE_CLASS,
  LANDING_PRODUCT_IMAGE_HEIGHT,
  LANDING_PRODUCT_IMAGE_SIZES,
  LANDING_PRODUCT_IMAGE_WIDTH,
  LANDING_PRODUCT_MOBILE_IMAGE_SIZES,
  LANDING_PRODUCT_STAGE_SIZE_CLASS,
} from '@/lib/landing-product-display'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type ProductStageItem = { src: string; alt: string }

type LandingProductStageProps = {
  items: ProductStageItem[]
  activeIndex: number
  className?: string
  priority?: boolean
  aspectRatio?: string
  sizes?: string
  /** When set, the inner frame uses these classes instead of a fluid aspect-ratio box. */
  stageFrameClassName?: string
  imageClassName?: string
}

export function LandingProductStage({
  items,
  activeIndex,
  className,
  priority = false,
  aspectRatio = LANDING_PRODUCT_IMAGE_ASPECT,
  sizes = LANDING_PRODUCT_IMAGE_SIZES,
  stageFrameClassName,
  imageClassName,
}: LandingProductStageProps) {
  if (items.length === 0) return null

  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <div
        className={cn(
          'relative bg-card',
          stageFrameClassName ?? 'h-full w-full',
        )}
        style={stageFrameClassName ? undefined : { aspectRatio }}
      >
        {items.map((item, index) => {
          const isRaster = /\.(png|jpe?g|webp)$/i.test(item.src)
          const isActive = index === activeIndex

          return (
            <div
              key={`${item.src}-${index}`}
              className={cn(
                'absolute inset-0 transition-opacity duration-700 ease-out motion-reduce:transition-none',
                isActive ? 'z-10 opacity-100' : 'z-0 opacity-0'
              )}
            >
              <Image
                src={item.src}
                alt={item.alt}
                fill
                priority={priority || index === 0}
                quality={100}
                unoptimized={isRaster}
                sizes={sizes}
                className={cn('object-contain object-center', imageClassName)}
              />
            </div>
          )
        })}
      </div>
    </Card>
  )
}

type LandingProductFrameProps = {
  src: string
  alt: string
  width?: number
  height?: number
  className?: string
  priority?: boolean
  sizes?: string
}

/** Single-image card — uses intrinsic dimensions (ideal for mobile portrait assets). */
export function LandingProductFrame({
  src,
  alt,
  width = LANDING_PRODUCT_IMAGE_WIDTH,
  height = LANDING_PRODUCT_IMAGE_HEIGHT,
  className,
  priority = false,
  sizes = LANDING_PRODUCT_MOBILE_IMAGE_SIZES,
}: LandingProductFrameProps) {
  const isRaster = /\.(png|jpe?g|webp)$/i.test(src)

  return (
    <Card className={cn('overflow-hidden p-0', className)}>
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        quality={100}
        unoptimized={isRaster}
        sizes={sizes}
        className={LANDING_PRODUCT_IMAGE_CLASS}
      />
    </Card>
  )
}

/** @deprecated Use LandingProductStage */
export function LandingProductFrameStack({
  items,
  activeIndex,
  className,
}: {
  items: ProductStageItem[]
  activeIndex: number
  className?: string
  overlay?: ReactNode
}) {
  return (
    <LandingProductStage
      items={items}
      activeIndex={activeIndex}
      className={className}
    />
  )
}

/** Standalone image card without tour pair. */
export function LandingProductImageCard({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string
  alt: string
  className?: string
  priority?: boolean
}) {
  const isRaster = /\.(png|jpe?g|webp)$/i.test(src)

  return (
    <Card
      className={cn(
        'overflow-hidden p-0',
        LANDING_PRODUCT_STAGE_SIZE_CLASS,
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={LANDING_PRODUCT_IMAGE_WIDTH}
        height={LANDING_PRODUCT_IMAGE_HEIGHT}
        priority={priority}
        quality={100}
        unoptimized={isRaster}
        sizes={LANDING_PRODUCT_IMAGE_SIZES}
        className={LANDING_PRODUCT_IMAGE_CLASS}
      />
    </Card>
  )
}