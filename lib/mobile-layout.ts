/**
 * Mobile-only layout utilities. Desktop (lg+) styles are unchanged — these use max-md / max-lg.
 */

/** Full-width selects and toolbar controls on phones */
export const MOBILE_SELECT_TRIGGER_CLASS = 'max-md:w-full max-md:min-w-0'

/** Horizontal tab bars that scroll instead of clipping */
export const MOBILE_TAB_LIST_CLASS =
  'max-md:w-full max-md:justify-start max-md:overflow-x-auto max-md:flex-nowrap max-md:[&_[data-slot=tabs-trigger]]:shrink-0'

/** Tablet-wide tab bars (client detail, multi-tab toolbars) */
export const MOBILE_LG_TAB_LIST_CLASS =
  'max-lg:w-full max-lg:justify-start max-lg:overflow-x-auto max-lg:flex-nowrap max-lg:[&_[data-slot=tabs-trigger]]:shrink-0'

/** Stack toolbars on phones */
export const MOBILE_TOOLBAR_ROW_CLASS =
  'flex flex-wrap items-center gap-3 max-md:w-full max-md:flex-col max-md:items-stretch'

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
export const MOBILE_LIST_STACK_CLASS = `space-y-3 md:hidden ${MOBILE_NATURAL_HEIGHT_CLASS}`

/** Standard dashboard page root */
export const MOBILE_PAGE_ROOT_CLASS =
  'flex h-full min-h-0 flex-col p-6 max-md:h-auto max-md:min-h-0 max-md:overflow-x-hidden max-md:p-4'

/** Primary actions that should span the screen on phones */
export const MOBILE_FULL_WIDTH_BUTTON_CLASS = 'max-md:w-full max-md:min-h-11'

/** Page title row that stacks on narrow screens */
export const MOBILE_HEADER_STACK_CLASS =
  'flex items-center justify-between max-md:flex-col max-md:items-stretch max-md:gap-3'