'use client'

import { useEffect, useState } from 'react'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'

type UseLandingChapterScrollOptions = {
  sectionIds: string[]
  desktopBreakpoint?: string
}

export function useLandingChapterScroll({
  sectionIds,
  desktopBreakpoint = '(min-width: 1024px)',
}: UseLandingChapterScrollOptions) {
  const [activeIndex, setActiveIndex] = useState(0)
  const scrollRoot = useLandingScrollRoot()

  useEffect(() => {
    if (!scrollRoot || sectionIds.length === 0) return

    const media = window.matchMedia(desktopBreakpoint)

    const resolveActiveIndex = () => {
      const attr = media.matches
        ? 'data-landing-chapter-desktop'
        : 'data-landing-chapter-mobile'

      const rootRect = scrollRoot.getBoundingClientRect()
      const target = rootRect.top + rootRect.height * 0.45

      let nextIndex = 0
      let closestDistance = Number.POSITIVE_INFINITY

      sectionIds.forEach((id, index) => {
        const node = scrollRoot.querySelector<HTMLElement>(`[${attr}="${id}"]`)
        if (!node) return

        const rect = node.getBoundingClientRect()
        const center = rect.top + rect.height / 2
        const distance = Math.abs(center - target)

        if (distance < closestDistance) {
          closestDistance = distance
          nextIndex = index
        }
      })

      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))
    }

    let frame = 0
    const scheduleResolve = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(resolveActiveIndex)
    }

    resolveActiveIndex()
    scrollRoot.addEventListener('scroll', scheduleResolve, { passive: true })
    window.addEventListener('resize', scheduleResolve)
    media.addEventListener('change', scheduleResolve)

    return () => {
      cancelAnimationFrame(frame)
      scrollRoot.removeEventListener('scroll', scheduleResolve)
      window.removeEventListener('resize', scheduleResolve)
      media.removeEventListener('change', scheduleResolve)
    }
  }, [scrollRoot, sectionIds, desktopBreakpoint])

  return activeIndex
}