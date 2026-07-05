'use client'

import Link from 'next/link'
import { useLinkStatus } from 'next/link'
import { Loader2, type LucideIcon } from 'lucide-react'
import { useNavigation } from '@/components/navigation/navigation-provider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type SidebarNavLinkProps = {
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
  expanded?: boolean
  onNavigate?: () => void
  locked?: boolean
  upgradeMessage?: string
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

function LockedNavItem({
  label,
  icon: Icon,
  expanded,
  upgradeMessage,
}: {
  label: string
  icon: LucideIcon
  expanded: boolean
  upgradeMessage: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-disabled="true"
            className={cn(
              'relative flex cursor-not-allowed items-center rounded-lg font-medium text-muted-foreground/45',
              expanded ? 'px-3 py-2.5 text-sm' : 'px-3 py-2 text-sm justify-center'
            )}
          >
            <Icon className="size-5 shrink-0 opacity-50" />
            {expanded && <span className="ml-3 truncate opacity-70">{label}</span>}
          </span>
        }
      />
      <TooltipContent side="right" className="max-w-xs">
        {upgradeMessage}
      </TooltipContent>
    </Tooltip>
  )
}

function ActiveSidebarNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  expanded = true,
  onNavigate,
}: Omit<SidebarNavLinkProps, 'locked' | 'upgradeMessage'>) {
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

export function SidebarNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  expanded = true,
  onNavigate,
  locked = false,
  upgradeMessage,
}: SidebarNavLinkProps) {
  if (locked && upgradeMessage) {
    return (
      <LockedNavItem
        label={label}
        icon={Icon}
        expanded={expanded}
        upgradeMessage={upgradeMessage}
      />
    )
  }

  return (
    <ActiveSidebarNavLink
      href={href}
      label={label}
      icon={Icon}
      isActive={isActive}
      expanded={expanded}
      onNavigate={onNavigate}
    />
  )
}