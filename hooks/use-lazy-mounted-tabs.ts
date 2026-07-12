'use client'

import { useCallback, useEffect, useState } from 'react'

export function trackLazyMountedTab<T extends string>(
  mountedTabs: ReadonlySet<T>,
  activeTab: T
): Set<T> {
  if (mountedTabs.has(activeTab)) {
    return mountedTabs instanceof Set ? mountedTabs : new Set(mountedTabs)
  }

  const next = new Set(mountedTabs)
  next.add(activeTab)
  return next
}

export function useLazyMountedTabs<T extends string>(activeTab: T, initialTab: T) {
  const [mountedTabs, setMountedTabs] = useState<Set<T>>(() => new Set([initialTab]))

  const mountTab = useCallback((tab: T) => {
    setMountedTabs((current) => trackLazyMountedTab(current, tab))
  }, [])

  useEffect(() => {
    mountTab(activeTab)
  }, [activeTab, mountTab])

  return { mountedTabs, mountTab }
}