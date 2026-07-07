'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import {
  ACCENT_COLOR_STORAGE_KEY,
  applyAccentColorToDocument,
  clearAccentColorFromDocument,
  normalizeAccentColor,
  setBackgroundBodyClass,
  type PersonalizationState,
} from '@/lib/personalization'

type PersonalizationContextValue = PersonalizationState & {
  setAccentColor: (accentColor: string | null) => void
  setBackgroundImageUrl: (backgroundImageUrl: string | null) => void
}

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null)

export function PersonalizationProvider({
  children,
  initialPersonalization,
}: {
  children: React.ReactNode
  initialPersonalization: PersonalizationState
}) {
  const [accentColor, setAccentColorState] = useState<string | null>(
    initialPersonalization.accentColor
  )
  const [backgroundImageUrl, setBackgroundImageUrlState] = useState<string | null>(
    initialPersonalization.backgroundImageUrl
  )

  useLayoutEffect(() => {
    try {
      // Signed URLs expire; never hydrate background from localStorage.
      localStorage.removeItem('background-image-url')

      const storedAccent = localStorage.getItem(ACCENT_COLOR_STORAGE_KEY)
      const nextAccent =
        normalizeAccentColor(storedAccent) ?? initialPersonalization.accentColor
      const nextBackground = initialPersonalization.backgroundImageUrl

      if (nextAccent !== accentColor) setAccentColorState(nextAccent)
      if (nextBackground !== backgroundImageUrl) setBackgroundImageUrlState(nextBackground)

      applyAccentColorToDocument(nextAccent)
      setBackgroundBodyClass(Boolean(nextBackground))
    } catch {
      applyAccentColorToDocument(initialPersonalization.accentColor)
      setBackgroundBodyClass(Boolean(initialPersonalization.backgroundImageUrl))
    }
  }, [initialPersonalization.accentColor, initialPersonalization.backgroundImageUrl])

  useEffect(() => {
    applyAccentColorToDocument(accentColor)
    try {
      if (accentColor) {
        localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, accentColor)
      } else {
        localStorage.removeItem(ACCENT_COLOR_STORAGE_KEY)
      }
    } catch {
      // localStorage may be unavailable
    }
  }, [accentColor])

  useEffect(() => {
    setBackgroundBodyClass(Boolean(backgroundImageUrl))
  }, [backgroundImageUrl])

  const setAccentColor = useCallback((next: string | null) => {
    const normalized = normalizeAccentColor(next)
    setAccentColorState(normalized)
    if (!normalized) {
      clearAccentColorFromDocument()
    }
  }, [])

  const setBackgroundImageUrl = useCallback((next: string | null) => {
    setBackgroundImageUrlState(next?.trim() || null)
  }, [])

  const value = useMemo(
    () => ({
      accentColor,
      backgroundImageUrl,
      setAccentColor,
      setBackgroundImageUrl,
    }),
    [accentColor, backgroundImageUrl, setAccentColor, setBackgroundImageUrl]
  )

  return (
    <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>
  )
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext)
  if (!context) {
    return {
      accentColor: null,
      backgroundImageUrl: null,
      setAccentColor: () => {},
      setBackgroundImageUrl: () => {},
    }
  }
  return context
}