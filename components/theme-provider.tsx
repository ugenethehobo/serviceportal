'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme'

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme: ThemePreference
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={initialTheme}
      enableSystem={false}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}