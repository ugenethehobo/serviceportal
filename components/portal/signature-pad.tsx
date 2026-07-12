'use client'

import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type SignaturePadHandle = {
  isEmpty: () => boolean
  toDataUrl: () => string | null
  clear: () => void
}

type SignaturePadProps = {
  label: string
  className?: string
  height?: number
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ label, className, height = 140 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const drawingRef = useRef(false)
    const [hasInk, setHasInk] = useState(false)

    const getContext = useCallback(() => {
      const canvas = canvasRef.current
      if (!canvas) return null
      return canvas.getContext('2d')
    }, [])

    const resizeCanvas = useCallback(() => {
      const canvas = canvasRef.current
      const ctx = getContext()
      if (!canvas || !ctx) return

      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      const imageData = hasInk ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null

      canvas.width = Math.max(1, Math.floor(rect.width * ratio))
      canvas.height = Math.max(1, Math.floor(height * ratio))
      canvas.style.height = `${height}px`

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2
      ctx.strokeStyle = '#111111'

      if (imageData) {
        ctx.putImageData(imageData, 0, 0)
      }
    }, [getContext, hasInk, height])

    useEffect(() => {
      resizeCanvas()
      window.addEventListener('resize', resizeCanvas)
      return () => window.removeEventListener('resize', resizeCanvas)
    }, [resizeCanvas])

    const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    }

    const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const ctx = getContext()
      if (!ctx) return
      event.currentTarget.setPointerCapture(event.pointerId)
      drawingRef.current = true
      const point = getPoint(event)
      ctx.beginPath()
      ctx.moveTo(point.x, point.y)
    }

    const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      const ctx = getContext()
      if (!ctx) return
      const point = getPoint(event)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      if (!hasInk) setHasInk(true)
    }

    const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return
      drawingRef.current = false
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    }

    const clear = useCallback(() => {
      const canvas = canvasRef.current
      const ctx = getContext()
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setHasInk(false)
    }, [getContext])

    useImperativeHandle(
      ref,
      () => ({
        isEmpty: () => !hasInk,
        toDataUrl: () => {
          if (!hasInk) return null
          const canvas = canvasRef.current
          if (!canvas) return null
          return canvas.toDataURL('image/png')
        },
        clear,
      }),
      [clear, hasInk]
    )

    return (
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{label}</p>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
        </div>
        <div className="rounded-lg border bg-white shadow-sm">
          <canvas
            ref={canvasRef}
            className="block w-full touch-none cursor-crosshair rounded-lg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrawing}
            onPointerLeave={stopDrawing}
            aria-label={label}
          />
        </div>
      </div>
    )
  }
)