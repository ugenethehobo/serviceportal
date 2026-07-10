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

/** Stacked card/list rows shown only on phones */
export const MOBILE_LIST_STACK_CLASS = 'space-y-3 md:hidden'

/** Standard dashboard page root */
export const MOBILE_PAGE_ROOT_CLASS =
  'flex h-full min-h-0 flex-col p-6 max-md:overflow-x-hidden max-md:p-4'