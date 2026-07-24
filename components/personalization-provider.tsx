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
import { useTheme } from '@/components/theme-provider'
import {
  ACCENT_COLOR_STORAGE_KEY,
  BACKGROUND_COLOR_STORAGE_KEY,
  CARD_COLOR_STORAGE_KEY,
  TEXT_COLOR_STORAGE_KEY,
  applyPersonalizationToDocument,
  normalizeHexColor,
  type PersonalizationState,
} from '@/lib/personalization'

type PersonalizationContextValue = PersonalizationState & {
  setAccentColor: (accentColor: string | null) => void
  setBackgroundImageUrl: (backgroundImageUrl: string | null) => void
  setBackgroundColor: (backgroundColor: string | null) => void
  setCardColor: (cardColor: string | null) => void
  setTextColor: (textColor: string | null) => void
  replacePersonalization: (next: Partial<PersonalizationState>) => void
}

const PersonalizationContext = createContext<PersonalizationContextValue | null>(null)

function persistHex(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // localStorage may be unavailable
  }
}

export function PersonalizationProvider({
  children,
  initialPersonalization,
}: {
  children: React.ReactNode
  initialPersonalization: PersonalizationState
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [state, setState] = useState<PersonalizationState>({
    accentColor: initialPersonalization.accentColor,
    backgroundImageUrl: initialPersonalization.backgroundImageUrl,
    backgroundColor: initialPersonalization.backgroundColor,
    cardColor: initialPersonalization.cardColor,
    textColor: initialPersonalization.textColor,
  })

  useLayoutEffect(() => {
    try {
      // Signed URLs expire; never hydrate background image from localStorage.
      localStorage.removeItem('background-image-url')

      const storedAccent = normalizeHexColor(localStorage.getItem(ACCENT_COLOR_STORAGE_KEY))
      const storedCard = normalizeHexColor(localStorage.getItem(CARD_COLOR_STORAGE_KEY))
      const storedText = normalizeHexColor(localStorage.getItem(TEXT_COLOR_STORAGE_KEY))
      const storedBg = normalizeHexColor(localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY))

      const next: PersonalizationState = {
        accentColor: storedAccent ?? initialPersonalization.accentColor,
        backgroundImageUrl: initialPersonalization.backgroundImageUrl,
        backgroundColor: storedBg ?? initialPersonalization.backgroundColor,
        cardColor: storedCard ?? initialPersonalization.cardColor,
        textColor: storedText ?? initialPersonalization.textColor,
      }

      setState(next)
      applyPersonalizationToDocument(next)
    } catch {
      applyPersonalizationToDocument(initialPersonalization)
    }
  }, [
    initialPersonalization.accentColor,
    initialPersonalization.backgroundImageUrl,
    initialPersonalization.backgroundColor,
    initialPersonalization.cardColor,
    initialPersonalization.textColor,
  ])

  // Layout effect so light/dark text + borders flip before paint (avoids a white-text flash).
  useLayoutEffect(() => {
    applyPersonalizationToDocument(state, { isDark })
  }, [state, isDark])

  useEffect(() => {
    persistHex(ACCENT_COLOR_STORAGE_KEY, state.accentColor)
    persistHex(CARD_COLOR_STORAGE_KEY, state.cardColor)
    persistHex(TEXT_COLOR_STORAGE_KEY, state.textColor)
    // Only cache solid background when no image (image mode clears solid)
    persistHex(
      BACKGROUND_COLOR_STORAGE_KEY,
      state.backgroundImageUrl ? null : state.backgroundColor
    )
  }, [state])

  const replacePersonalization = useCallback((partial: Partial<PersonalizationState>) => {
    setState((prev) => ({
      ...prev,
      ...partial,
      accentColor:
        partial.accentColor !== undefined
          ? normalizeHexColor(partial.accentColor)
          : prev.accentColor,
      backgroundColor:
        partial.backgroundColor !== undefined
          ? normalizeHexColor(partial.backgroundColor)
          : prev.backgroundColor,
      cardColor:
        partial.cardColor !== undefined
          ? normalizeHexColor(partial.cardColor)
          : prev.cardColor,
      textColor:
        partial.textColor !== undefined
          ? normalizeHexColor(partial.textColor)
          : prev.textColor,
      backgroundImageUrl:
        partial.backgroundImageUrl !== undefined
          ? partial.backgroundImageUrl?.trim() || null
          : prev.backgroundImageUrl,
    }))
  }, [])

  const setAccentColor = useCallback((next: string | null) => {
    replacePersonalization({ accentColor: next })
  }, [replacePersonalization])

  const setBackgroundImageUrl = useCallback((next: string | null) => {
    replacePersonalization({
      backgroundImageUrl: next,
      // Image wins over solid color in the UI
      ...(next ? { backgroundColor: null } : {}),
    })
  }, [replacePersonalization])

  const setBackgroundColor = useCallback((next: string | null) => {
    replacePersonalization({
      backgroundColor: next,
      ...(next ? { backgroundImageUrl: null } : {}),
    })
  }, [replacePersonalization])

  const setCardColor = useCallback(
    (next: string | null) => replacePersonalization({ cardColor: next }),
    [replacePersonalization]
  )

  const setTextColor = useCallback(
    (next: string | null) => replacePersonalization({ textColor: next }),
    [replacePersonalization]
  )

  const value = useMemo(
    () => ({
      ...state,
      setAccentColor,
      setBackgroundImageUrl,
      setBackgroundColor,
      setCardColor,
      setTextColor,
      replacePersonalization,
    }),
    [
      state,
      setAccentColor,
      setBackgroundImageUrl,
      setBackgroundColor,
      setCardColor,
      setTextColor,
      replacePersonalization,
    ]
  )

  return (
    <PersonalizationContext.Provider value={value}>{children}</PersonalizationContext.Provider>
  )
}

const NOOP_PERSONALIZATION: PersonalizationContextValue = {
  accentColor: null,
  backgroundImageUrl: null,
  backgroundColor: null,
  cardColor: null,
  textColor: null,
  setAccentColor: () => {},
  setBackgroundImageUrl: () => {},
  setBackgroundColor: () => {},
  setCardColor: () => {},
  setTextColor: () => {},
  replacePersonalization: () => {},
}

export function usePersonalization() {
  const context = useContext(PersonalizationContext)
  return context ?? NOOP_PERSONALIZATION
}
