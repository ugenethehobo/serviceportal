'use client'

import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  getAppleMapsNavigationUrl,
  getGoogleMapsNavigationUrl,
  getNavigationLabel,
  isApplePlatform,
  openNavigation,
} from '@/lib/maps-navigation'
import { ChevronDown, Navigation } from 'lucide-react'

interface MapsNavigateButtonProps {
  address: string
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  className?: string
  showMenu?: boolean
}

function hasNavigableAddress(address: string) {
  const trimmed = address.trim()
  return Boolean(trimmed) && trimmed !== 'No address on file'
}

function splitButtonDividerClass(variant: MapsNavigateButtonProps['variant']) {
  switch (variant) {
    case 'outline':
      return 'border-l border-border'
    case 'secondary':
      return 'border-l border-secondary-foreground/15'
    case 'ghost':
      return 'border-l border-border/60'
    default:
      return 'border-l border-primary-foreground/20'
  }
}

export function MapsNavigateButton({
  address,
  size = 'default',
  variant = 'default',
  className,
  showMenu = true,
}: MapsNavigateButtonProps) {
  if (!hasNavigableAddress(address)) return null

  const primaryLabel = getNavigationLabel()

  if (!showMenu) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        className={className}
        onClick={() => openNavigation(address)}
      >
        <Navigation className="size-4" />
        Navigate
      </Button>
    )
  }

  return (
    <div className={cn('inline-flex w-full min-w-0', className)}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className="min-w-0 flex-1 rounded-r-none"
        onClick={() => openNavigation(address)}
      >
        <Navigation className="size-4 shrink-0" />
        <span className="truncate">{primaryLabel}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant, size }),
            'shrink-0 rounded-l-none px-2',
            splitButtonDividerClass(variant)
          )}
        >
          <ChevronDown className="size-4" />
          <span className="sr-only">Choose maps app</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() =>
              window.open(getGoogleMapsNavigationUrl(address), '_blank', 'noopener,noreferrer')
            }
          >
            Google Maps
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              window.open(getAppleMapsNavigationUrl(address), '_blank', 'noopener,noreferrer')
            }
          >
            Apple Maps
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function useMapsPlatform() {
  return isApplePlatform()
}