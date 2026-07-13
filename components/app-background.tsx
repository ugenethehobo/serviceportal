'use client'

import { useCallback } from 'react'
import { refreshBackgroundImageUrlAction } from '@/app/action'
import { usePersonalization } from '@/components/personalization-provider'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

/** Mobile-only: paint behind iOS Safari collapsing toolbars (content layout unchanged). */
const MOBILE_IOS_BLEED_SURFACE_CLASS =
  'fixed top-0 right-0 left-0 z-0 h-[100lvh] min-h-[100lvh] w-full md:hidden'

const MOBILE_IOS_WALLPAPER_FRAME_CLASS =
  'max-md:top-0 max-md:right-0 max-md:left-0 max-md:h-[100lvh] max-md:min-h-[100lvh] max-md:w-full'

export function AppBackground() {
  const { backgroundImageUrl, setBackgroundImageUrl } = usePersonalization()
  const { resolvedTheme } = useTheme()
  const refreshBackgroundUrl = useCallback(async () => {
    const result = await refreshBackgroundImageUrlAction()
    if (result.success) {
      setBackgroundImageUrl(result.backgroundUrl)
    }
  }, [setBackgroundImageUrl])

  const wallpaperUnderlayClass =
    resolvedTheme === 'dark' ? 'bg-black' : 'bg-white'

  return (
    <>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none',
          MOBILE_IOS_BLEED_SURFACE_CLASS,
          backgroundImageUrl ? wallpaperUnderlayClass : 'bg-background'
        )}
      />
      {backgroundImageUrl ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none fixed inset-0 z-0',
            MOBILE_IOS_WALLPAPER_FRAME_CLASS
          )}
        >
          <img
            src={backgroundImageUrl}
            alt=""
            decoding="async"
            loading="lazy"
            fetchPriority="low"
            className="absolute inset-0 size-full min-h-full object-cover object-center"
            onError={() => void refreshBackgroundUrl()}
          />
          <div
            className={cn(
              'absolute inset-0 min-h-full',
              resolvedTheme === 'dark' ? 'bg-black/82' : 'bg-white/88'
            )}
          />
        </div>
      ) : null}
    </>
  )
}