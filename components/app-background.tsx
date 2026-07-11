'use client'

import { useCallback } from 'react'
import { refreshBackgroundImageUrlAction } from '@/app/action'
import { usePersonalization } from '@/components/personalization-provider'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

export function AppBackground() {
  const { backgroundImageUrl, setBackgroundImageUrl } = usePersonalization()
  const { resolvedTheme } = useTheme()
  const refreshBackgroundUrl = useCallback(async () => {
    const result = await refreshBackgroundImageUrlAction()
    if (result.success) {
      setBackgroundImageUrl(result.backgroundUrl)
    }
  }, [setBackgroundImageUrl])

  if (!backgroundImageUrl) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
      <img
        src={backgroundImageUrl}
        alt=""
        decoding="async"
        loading="lazy"
        fetchPriority="low"
        className="absolute inset-0 size-full object-cover object-center"
        onError={() => void refreshBackgroundUrl()}
      />
      <div
        className={cn(
          'absolute inset-0',
          resolvedTheme === 'dark' ? 'bg-black/82' : 'bg-white/88'
        )}
      />
    </div>
  )
}