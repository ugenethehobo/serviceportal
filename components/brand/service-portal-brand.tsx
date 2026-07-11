import Image from 'next/image'
import Link from 'next/link'
import { SERVICE_PORTAL_BRAND_NAME, SERVICE_PORTAL_LOGO_SRC } from '@/lib/brand'
import { cn } from '@/lib/utils'

type ServicePortalBrandProps = {
  href?: string
  showName?: boolean
  className?: string
  logoClassName?: string
}

export function ServicePortalBrand({
  href = '/',
  showName = true,
  className,
  logoClassName,
}: ServicePortalBrandProps) {
  const content = (
    <>
      <Image
        src={SERVICE_PORTAL_LOGO_SRC}
        alt={`${SERVICE_PORTAL_BRAND_NAME} logo`}
        width={32}
        height={32}
        className={cn('size-8 shrink-0 rounded-md object-contain', logoClassName)}
        priority
      />
      {showName ? <span>{SERVICE_PORTAL_BRAND_NAME}</span> : null}
    </>
  )

  if (!href) {
    return (
      <div className={cn('flex items-center gap-2 font-medium', className)}>{content}</div>
    )
  }

  return (
    <Link href={href} className={cn('flex items-center gap-2 font-medium', className)}>
      {content}
    </Link>
  )
}