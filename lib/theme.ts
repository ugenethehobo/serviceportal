export type ThemePreference = 'light' | 'dark'

export const DEFAULT_THEME: ThemePreference = 'light'
export const THEME_COOKIE_NAME = 'theme-preference'
export const THEME_STORAGE_KEY = 'theme-preference'

export function normalizeThemePreference(value?: string | null): ThemePreference {
  return value === 'dark' ? 'dark' : 'light'
}

export function isThemePreference(value: string): value is ThemePreference {
  return value === 'light' || value === 'dark'
}