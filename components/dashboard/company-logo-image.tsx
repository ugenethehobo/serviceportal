'use client'

import { useEffect, useState } from 'react'
import { getCompanyLogoDisplayUrlAction } from '@/app/action'
import { cn } from '@/lib/utils'

interface CompanyLogoImageProps {
  logoRef: string | null | undefined
  companyName: string
  className?: string
  imageClassName?: string
  fallbackClassName?: string
}

export function CompanyLogoImage({
  logoRef,
  companyName,
  className,
  imageClassName,
  fallbackClassName,
}: CompanyLogoImageProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHasError(false)

    if (!logoRef?.trim()) {
      setDisplayUrl(null)
      return
    }

    void getCompanyLogoDisplayUrlAction(logoRef).then((result) => {
      if (cancelled) return
      if (result.success && result.url) {
        setDisplayUrl(result.url)
      } else {
        setDisplayUrl(null)
        setHasError(true)
      }
    })

    return () => {
      cancelled = true
    }
  }, [logoRef])

  const initials = (companyName || 'Co').slice(0, 2).toUpperCase()
  const showImage = displayUrl && !hasError

  return (
    <div className={cn('relative shrink-0', className)}>
      {showImage ? (
        <img
          src={displayUrl}
          alt={companyName}
          className={cn('object-cover', imageClassName)}
          onError={() => setHasError(true)}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center bg-muted text-muted-foreground font-bold',
            fallbackClassName
          )}
        >
          <span>{initials}</span>
        </div>
      )}
    </div>
  )
}