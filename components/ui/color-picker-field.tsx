'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Input as AriaInput,
  Label as AriaLabel,
  Popover as AriaPopover,
  parseColor,
  type Color,
} from 'react-aria-components'
import {
  ColorArea,
  ColorField,
  ColorPicker,
  ColorSlider,
  ColorSwatch,
  ColorThumb,
  SliderTrack,
} from '@/components/ui/color'
import { Button } from '@/components/ui/button'
import { normalizeHexColor } from '@/lib/personalization'
import { cn } from '@/lib/utils'
import { RotateCcw } from 'lucide-react'

type ColorPickerFieldProps = {
  /** Current hex (#rrggbb) or null for theme default. */
  value: string | null
  /** Starting color when value is null. */
  fallbackHex: string
  onChange: (hex: string) => void
  label: string
  description?: string
  disabled?: boolean
  className?: string
  /** stack = label above control; inline = compact settings row. */
  layout?: 'stack' | 'inline'
  onReset?: () => void
  resetLabel?: string
  resetDisabled?: boolean
}

function safeParseColor(hex: string): Color {
  try {
    return parseColor(normalizeHexColor(hex) || '#2563eb')
  } catch {
    return parseColor('#2563eb')
  }
}

/**
 * Combined color picker using Jolly UI / React Aria color primitives
 * (swatch trigger + area + hue slider + hex field).
 */
export function ColorPickerField({
  value,
  fallbackHex,
  onChange,
  label,
  description,
  disabled = false,
  className,
  layout = 'stack',
  onReset,
  resetLabel = 'Reset',
  resetDisabled = false,
}: ColorPickerFieldProps) {
  const displayHex = normalizeHexColor(value) || normalizeHexColor(fallbackHex) || '#2563eb'
  const [color, setColor] = useState<Color>(() => safeParseColor(displayHex))

  useEffect(() => {
    setColor(safeParseColor(displayHex))
  }, [displayHex])

  const triggerLabel = useMemo(
    () => (value ? displayHex.toUpperCase() : 'Default'),
    [value, displayHex]
  )

  const picker = (
    <ColorPicker
      value={color}
      onChange={(next) => {
        setColor(next)
        const hex = normalizeHexColor(next.toString('hex'))
        if (hex) onChange(hex)
      }}
    >
      <DialogTrigger>
        <AriaButton
          isDisabled={disabled}
          className={cn(
            'inline-flex h-9 max-w-full items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm outline-none',
            'hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
            'disabled:pointer-events-none disabled:opacity-50'
          )}
        >
          <ColorSwatch className="size-6 shrink-0 rounded-md border border-border shadow-sm" />
          <span className="truncate font-mono text-xs">{triggerLabel}</span>
        </AriaButton>
        <AriaPopover className="z-50 w-auto overflow-auto rounded-lg border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none">
          <Dialog className="outline-none">
            <div className="flex flex-col gap-3 p-3">
              <ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness">
                <ColorThumb />
              </ColorArea>
              <ColorSlider colorSpace="hsb" channel="hue">
                <SliderTrack>
                  <ColorThumb />
                </SliderTrack>
              </ColorSlider>
              <ColorField className="flex flex-col gap-1.5">
                <AriaLabel className="text-xs font-medium text-muted-foreground">Hex</AriaLabel>
                <AriaInput
                  className={cn(
                    'h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs outline-none',
                    'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30'
                  )}
                />
              </ColorField>
            </div>
          </Dialog>
        </AriaPopover>
      </DialogTrigger>
    </ColorPicker>
  )

  const resetButton =
    onReset != null ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
        onClick={onReset}
        disabled={disabled || resetDisabled}
      >
        <RotateCcw className="size-3.5" />
        <span className="sr-only sm:not-sr-only sm:ml-1.5">{resetLabel}</span>
      </Button>
    ) : null

  if (layout === 'inline') {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/50 px-3 py-2.5',
          className
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {picker}
          {resetButton}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {resetButton}
      </div>
      {picker}
    </div>
  )
}
