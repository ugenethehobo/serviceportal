import type { LandingFeatureSection, LandingProductScreenshot } from '@/lib/landing-page-config'
import {
  LANDING_PRODUCT_IMAGE_HEIGHT,
  LANDING_PRODUCT_IMAGE_WIDTH,
  LANDING_PRODUCT_MOBILE_IMAGE_HEIGHT,
  LANDING_PRODUCT_MOBILE_IMAGE_WIDTH,
} from '@/lib/landing-product-display'

export type ResolvedLandingProductImage = {
  src: string
  alt: string
  width: number
  height: number
  aspectRatio: string
}

function resolveScreenshot(
  screenshot: LandingProductScreenshot,
  defaults: { width: number; height: number }
): ResolvedLandingProductImage {
  const width = screenshot.width ?? defaults.width
  const height = screenshot.height ?? defaults.height

  return {
    src: screenshot.src,
    alt: screenshot.alt,
    width,
    height,
    aspectRatio: `${width} / ${height}`,
  }
}

/** Desktop tour uses `image`; mobile uses `mobileImage` when provided. */
export function resolveLandingProductImage(
  section: LandingFeatureSection,
  variant: 'desktop' | 'mobile'
): ResolvedLandingProductImage {
  if (variant === 'mobile' && section.mobileImage) {
    return resolveScreenshot(section.mobileImage, {
      width: LANDING_PRODUCT_MOBILE_IMAGE_WIDTH,
      height: LANDING_PRODUCT_MOBILE_IMAGE_HEIGHT,
    })
  }

  return resolveScreenshot(section.image, {
    width: LANDING_PRODUCT_IMAGE_WIDTH,
    height: LANDING_PRODUCT_IMAGE_HEIGHT,
  })
}