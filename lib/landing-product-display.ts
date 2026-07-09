/**
 * Shared sizing and shells for landing product tour cards.
 * Desktop screenshots: 2000×1200 (5:3).
 * Mobile screenshots: portrait assets (default 1170×2532) — see `mobileImage` in landing-page-config.
 */

export const LANDING_PRODUCT_IMAGE_WIDTH = 2000
export const LANDING_PRODUCT_IMAGE_HEIGHT = 1200
export const LANDING_PRODUCT_IMAGE_ASPECT = '5 / 3'

/** Default mobile screenshot dimensions (override per asset in config). */
export const LANDING_PRODUCT_MOBILE_IMAGE_WIDTH = 1170
export const LANDING_PRODUCT_MOBILE_IMAGE_HEIGHT = 2532
export const LANDING_PRODUCT_MOBILE_IMAGE_ASPECT = '1170 / 2532'

export const LANDING_PRODUCT_IMAGE_SIZES =
  '(max-width: 1024px) 100vw, (max-width: 1536px) 92vw, 1088px'

export const LANDING_PRODUCT_MOBILE_IMAGE_SIZES = '100vw'

/** Product image column — height follows 5:3 aspect ratio (~653px tall at max). */
export const LANDING_PRODUCT_IMAGE_COLUMN_CLASS =
  'min-w-0 w-full max-w-[min(100%,68rem)] flex-1'

/** Default single-image stage (standalone). */
export const LANDING_PRODUCT_STAGE_SIZE_CLASS =
  'mx-auto w-full max-w-[min(100%,68rem)]'

/** Centered pair: chapter panel + product image. */
export const LANDING_PRODUCT_TOUR_PAIR_CLASS =
  'mx-auto flex w-full max-w-[92rem] items-stretch justify-center gap-4 sm:gap-5 lg:gap-6'

/** Centered tour column on desktop. */
export const LANDING_PRODUCT_TOUR_DESKTOP_CLASS = 'mx-auto w-full max-w-[92rem]'

export const LANDING_PRODUCT_IMAGE_CLASS =
  'h-auto w-full object-contain object-center'

/** Centered mobile tour block — stacked chapter + full-width mobile screenshot. */
export const LANDING_PRODUCT_MOBILE_CONTAINER_CLASS = 'mx-auto w-full max-w-md sm:max-w-lg'

export const LANDING_PRODUCT_MOBILE_STAGE_CLASS = 'w-full max-w-none'

/** Chapter text panel — matches product image height in the tour pair. */
export const LANDING_CHAPTER_PANEL_CLASS = 'relative w-64 shrink-0 sm:w-72 lg:w-80'

export const LANDING_CHAPTER_PANEL_CARD_CLASS =
  'flex h-full flex-col overflow-hidden p-0 bg-card shadow-lg ring-1 ring-foreground/10'

/** Scroll spacers that drive chapter transitions in the sticky stage. */
export const LANDING_CHAPTER_SCROLL_STEP_DESKTOP_CLASS = 'min-h-[75dvh]'
export const LANDING_CHAPTER_SCROLL_STEP_MOBILE_CLASS = 'min-h-[55dvh]'