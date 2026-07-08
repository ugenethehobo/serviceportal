/**
 * Landing page content — edit this file to update the public homepage.
 *
 * Images: drop files into `public/landing/` and update each slide:
 * - `src` — full-screen background
 * - `productImage.src` — screenshot shown in the hero card (changes with the slide)
 * Supported formats: jpg, png, webp, svg.
 */

/** Display version shown on the landing page footer and hero. */
export const SERVICE_PORTAL_VERSION = '0.0.24'

export type LandingSlide = {
  /** Background path under `public/`, e.g. `/landing/slide-1.jpg` */
  src: string
  alt: string
  /** Optional caption shown on the slide */
  caption?: string
  /**
   * Product screenshot shown in the hero card (syncs with this slide).
   * Drop images in `public/landing/` and set `productImage.src`.
   */
  productImage: {
    src: string
    alt: string
  }
}

export const LANDING_SLIDESHOW_SLIDES: LandingSlide[] = [
  {
    src: '/landing/slide-1.jpg',
    alt: 'Field crew coordinating jobs on site',
    caption: 'Schedule crews and jobs from one dashboard',
    productImage: {
      src: '/landing/product-1.svg',
      alt: 'ServicePortal schedule dashboard',
    },
  },
  {
    src: '/landing/slide-2.jpg',
    alt: 'Client portal and online payments',
    caption: 'Invoices, estimates, and portal payments',
    productImage: {
      src: '/landing/product-2.svg',
      alt: 'ServicePortal invoices and payments',
    },
  },
  {
    src: '/landing/slide-3.jpg',
    alt: 'Route planning and field operations',
    caption: 'Routes, photos, and recurring visits',
    productImage: {
      src: '/landing/product-3.svg',
      alt: 'ServicePortal route planner',
    },
  },
]

/** Milliseconds between automatic slide changes */
export const LANDING_SLIDESHOW_INTERVAL_MS = 6000
