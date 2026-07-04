'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

type NavigationContextValue = {
  startNavigation: (href: string) => void
  isNavigating: boolean
  pendingHref: string | null
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

function normalizeHref(href: string) {
  const [path] = href.split(/[?#]/)
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1)
  }
  return path
}

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  const startNavigation = useCallback(
    (href: string) => {
      const target = normalizeHref(href)
      const current = normalizeHref(pathname)
      if (target === current) return
      setPendingHref(href)
    },
    [pathname]
  )

  const value = useMemo(
    () => ({
      startNavigation,
      isNavigating: pendingHref !== null,
      pendingHref,
    }),
    [pendingHref, startNavigation]
  )

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  )
}

export function useNavigation() {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}