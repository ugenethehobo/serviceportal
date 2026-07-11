import { ServicePortalBrand } from '@/components/brand/service-portal-brand'
import type { ReactNode } from 'react'

const DEFAULT_COVER_IMAGE = '/landing/slide-1.jpg'

type AuthSplitLayoutProps = {
  children: ReactNode
  coverImageSrc?: string
  coverImageAlt?: string
}

export function AuthSplitLayout({
  children,
  coverImageSrc = DEFAULT_COVER_IMAGE,
  coverImageAlt = 'Field service team at work',
}: AuthSplitLayoutProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 supports-[padding:max(0px)]:pt-[max(1.5rem,env(safe-area-inset-top))] supports-[padding:max(0px)]:pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <ServicePortalBrand />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src={coverImageSrc}
          alt={coverImageAlt}
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}