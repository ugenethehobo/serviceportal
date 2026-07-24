/**
 * Mobile-only layout utilities. Desktop (lg+) styles are unchanged — these use max-md / max-lg.
 */

/** Full-width selects and toolbar controls on phones */
export const MOBILE_SELECT_TRIGGER_CLASS = 'max-md:w-full max-md:min-w-0'

/**
 * Horizontal tab bars that scroll instead of clipping.
 * overflow-y-hidden is required: with only overflow-x-auto, CSS treats the other
 * axis as auto too, so mobile tab strips scroll vertically as well as horizontally.
 * touch-pan-x keeps swipe gestures on the bar horizontal-only.
 * Triggers get min height + readable type so page switchers are easy to tap.
 */
export const MOBILE_TAB_LIST_CLASS =
  'max-md:h-auto max-md:min-h-11 max-md:w-full max-md:justify-start max-md:gap-1 max-md:overflow-x-auto max-md:overflow-y-hidden max-md:overscroll-x-contain max-md:touch-pan-x max-md:flex-nowrap max-md:p-1 max-md:[&_[data-slot=tabs-trigger]]:h-9 max-md:[&_[data-slot=tabs-trigger]]:min-h-9 max-md:[&_[data-slot=tabs-trigger]]:shrink-0 max-md:[&_[data-slot=tabs-trigger]]:px-3 max-md:[&_[data-slot=tabs-trigger]]:text-sm'

/** Tablet-wide tab bars (client detail, multi-tab toolbars) */
export const MOBILE_LG_TAB_LIST_CLASS =
  'max-lg:h-auto max-lg:min-h-11 max-lg:w-full max-lg:justify-start max-lg:gap-1 max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:overscroll-x-contain max-lg:touch-pan-x max-lg:flex-nowrap max-lg:p-1 max-lg:[&_[data-slot=tabs-trigger]]:h-9 max-lg:[&_[data-slot=tabs-trigger]]:min-h-9 max-lg:[&_[data-slot=tabs-trigger]]:shrink-0 max-lg:[&_[data-slot=tabs-trigger]]:px-3.5 max-lg:[&_[data-slot=tabs-trigger]]:text-sm'

/** Stack toolbars on phones */
export const MOBILE_TOOLBAR_ROW_CLASS =
  'flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-col max-md:items-stretch max-md:gap-3'

/** Hide wide tables on phones — pair with MOBILE_LIST_STACK_CLASS */
export const MOBILE_TABLE_DESKTOP_ONLY_CLASS = 'hidden md:block'

/**
 * Flex children that should grow with content on phones (page scrolls) instead of
 * filling the remaining viewport and nesting a tiny inner scroll area.
 */
export const MOBILE_NATURAL_HEIGHT_CLASS =
  'max-md:h-auto max-md:min-h-0 max-md:flex-none max-md:overflow-visible'

/** ScrollArea viewport overrides so content height flows on phones. */
export const MOBILE_SCROLL_VIEWPORT_CLASS =
  'max-md:!h-auto max-md:!max-h-none max-md:overflow-y-visible max-md:size-auto'

/** Stacked card/list rows shown only on phones */
export const MOBILE_LIST_STACK_CLASS = `space-y-3.5 md:hidden ${MOBILE_NATURAL_HEIGHT_CLASS}`

/** Standard dashboard page root */
export const MOBILE_PAGE_ROOT_CLASS =
  'flex h-full min-h-0 flex-col gap-5 p-6 max-md:h-auto max-md:min-h-0 max-md:gap-4 max-md:overflow-x-hidden max-md:p-4'

/** Primary actions that should span the screen on phones */
export const MOBILE_FULL_WIDTH_BUTTON_CLASS = 'max-md:w-full max-md:min-h-11'

/** Page title row that stacks on narrow screens */
export const MOBILE_HEADER_STACK_CLASS =
  'flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-3'

/**
 * MapLibre on phones: explicit height + no flex growth/shrink.
 * flex-1/min-h-0 on map surfaces collapses to 0px when ancestors use natural (h-auto) flow.
 */
export const MOBILE_MAP_MIN_HEIGHT_CLASS =
  'max-md:h-[42vh] max-md:min-h-[42vh] max-md:flex-none max-md:shrink-0'

/** Desktop map surfaces inside flex cards */
export const DESKTOP_MAP_SURFACE_CLASS = 'min-h-[240px] md:flex-1 md:min-h-0'

/**
 * Route planner on phones: fill the dashboard main column (pair with scroll-main flex col).
 * Desktop layout is unchanged — only max-md utilities.
 */
export const ROUTE_PLANNER_MOBILE_PAGE_CLASS =
  'max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden max-md:gap-2 max-md:p-3 max-md:pb-2 max-md:!h-auto'

/** Route planner map — full height on phones, not the dashboard 42vh cap. */
export const ROUTE_PLANNER_MOBILE_MAP_CLASS =
  'max-md:h-full max-md:min-h-0 max-md:flex-1 max-md:shrink-0'

/**
 * Fixed background layers on phones — use 100lvh so iOS Safari toolbar gaps
 * pick up theme/wallpaper instead of the default white browser canvas.
 */
export const IOS_VIEWPORT_BLEED_HEIGHT_CLASS = 'max-md:h-[100lvh] max-md:min-h-[100lvh]'

/** Dialog shell: top-anchored on phones, vertically scrollable body, no horizontal bleed. */
const SCROLLABLE_MODAL_SHELL_BASE =
  'flex w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 ' +
  'max-h-[calc(100dvh-2rem)] max-md:top-[max(1rem,env(safe-area-inset-top))] max-md:!translate-y-0 ' +
  'sm:max-h-[min(85dvh,36rem)]'

export const SCROLLABLE_MODAL_SHELL_MD = `${SCROLLABLE_MODAL_SHELL_BASE} !max-w-md`

export const SCROLLABLE_MODAL_SHELL_LG = `${SCROLLABLE_MODAL_SHELL_BASE} !max-w-lg`

/** Native scroll region inside a flex modal shell (replaces ScrollArea in dialogs). */
export const SCROLLABLE_MODAL_BODY_CLASS =
  'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scroll-fade'

/** Tighter dialog header padding on phones. */
export const SCROLLABLE_MODAL_HEADER_CLASS = 'shrink-0 max-md:px-4 max-md:py-3.5'