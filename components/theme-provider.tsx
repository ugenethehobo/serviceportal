'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { THEME_STORAGE_KEY, type ThemePreference } from '@/lib/theme'

type ThemeContextValue = {
  theme: ThemePreference
  resolvedTheme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyThemeClass(theme: ThemePreference) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme: ThemePreference
}) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored)
        applyThemeClass(stored)
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    applyThemeClass(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // localStorage may be unavailable
    }
  }, [])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
    }),
    [theme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      theme: 'light' as ThemePreference,
      resolvedTheme: 'light' as ThemePreference,
      setTheme: () => {},
    }
  }
  return context
}