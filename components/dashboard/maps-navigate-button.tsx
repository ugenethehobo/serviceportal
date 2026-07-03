'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    <div className={`flex ${className || ''}`}>
      <Button
        type="button"
        size={size}
        variant={variant}
        className="rounded-r-none flex-1"
        onClick={() => openNavigation(address)}
      >
        <Navigation className="size-4" />
        {primaryLabel}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={[
            'inline-flex items-center justify-center rounded-l-none border-l border-primary-foreground/20 px-2',
            size === 'lg' ? 'h-10' : size === 'sm' ? 'h-8' : 'h-9',
            variant === 'default'
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : variant === 'outline'
                ? 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                : 'hover:bg-accent hover:text-accent-foreground',
          ].join(' ')}
        >
          <ChevronDown className="size-4" />
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