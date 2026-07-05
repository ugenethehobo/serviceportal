'use client'

import { useEffect, useRef, useState } from 'react'

type DocumentTemplatePdfCanvasProps = {
  url: string | null
  width: number
  height: number
}

export function DocumentTemplatePdfCanvas({
  url,
  width,
  height,
}: DocumentTemplatePdfCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderState, setRenderState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')

  useEffect(() => {
    if (!url) {
      setRenderState('idle')
      return
    }

    let cancelled = false
    setRenderState('loading')

    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

        const pdf = await pdfjs.getDocument({ url }).promise
        const page = await pdf.getPage(1)
        const baseViewport = page.getViewport({ scale: 1 })
        const displayScale = width / baseViewport.width
        const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const viewport = page.getViewport({ scale: displayScale * outputScale })

        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        const pixelWidth = Math.floor(viewport.width)
        const pixelHeight = Math.floor(viewport.height)
        canvas.width = pixelWidth
        canvas.height = pixelHeight
        canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`
        canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`

        await page.render({
          canvas,
          viewport,
        }).promise

        if (!cancelled) setRenderState('ready')
      } catch {
        if (!cancelled) setRenderState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, width])

  if (!url) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0 block"
      aria-hidden={renderState !== 'ready'}
    />
  )
}