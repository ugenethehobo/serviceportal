'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { Loader2, type LucideIcon } from 'lucide-react'
import { useNavigation } from '@/components/navigation/navigation-provider'
import { cn } from '@/lib/utils'

type SidebarNavLinkProps = {
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
  expanded?: boolean
  onNavigate?: () => void
}

function NavLinkPendingSpinner({ expanded }: { expanded: boolean }) {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <Loader2
      data-pending="true"
      className={cn(
        'shrink-0 animate-spin text-muted-foreground',
        expanded ? 'ml-auto size-4' : 'absolute inset-0 m-auto size-3.5'
      )}
      aria-hidden
    />
  )
}

export function SidebarNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  expanded = true,
  onNavigate,
}: SidebarNavLinkProps) {
  const { startNavigation, isNavigating, pendingHref } = useNavigation()
  const isThisPending = pendingHref === href

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isActive) {
      event.preventDefault()
      onNavigate?.()
      return
    }

    startNavigation(href)
    onNavigate?.()
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-busy={isThisPending || undefined}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex items-center rounded-lg font-medium transition-colors',
        expanded ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm justify-center',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        isThisPending && 'pointer-events-none',
        isNavigating && !isThisPending && 'pointer-events-none opacity-60'
      )}
    >
      <Icon className={cn('size-5 shrink-0', isThisPending && 'opacity-50')} />
      {expanded && (
        <span className={cn('ml-3 truncate', isThisPending && 'opacity-80')}>{label}</span>
      )}
      <NavLinkPendingSpinner expanded={expanded} />
      {isThisPending && <span className="sr-only">Loading {label}</span>}
    </Link>
  )
}