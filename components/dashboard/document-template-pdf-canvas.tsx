'use client'

import { useEffect, useRef, useState } from 'react'

type DocumentTemplatePdfCanvasProps = {
  url: string | null
  width: number
  height: number
  /** Zero-based page to render. */
  pageIndex?: number
}

type PdfJsDocument = {
  numPages: number
  getPage: (pageNumber: number) => Promise<{
    getViewport: (options: { scale: number; rotation?: number }) => { width: number; height: number }
    render: (options: {
      canvas: HTMLCanvasElement
      viewport: { width: number; height: number }
    }) => { promise: Promise<void> }
  }>
}

// Page switches re-render from the parsed document instead of re-fetching the blob.
const documentCache = new Map<string, Promise<PdfJsDocument>>()

async function loadPdfDocument(url: string): Promise<PdfJsDocument> {
  const cached = documentCache.get(url)
  if (cached) return cached

  const promise = (async () => {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
    return (await pdfjs.getDocument({ url }).promise) as unknown as PdfJsDocument
  })()

  documentCache.set(url, promise)
  // Preview blobs are revoked after each re-render; keep the cache small.
  if (documentCache.size > 6) {
    const oldest = documentCache.keys().next().value
    if (oldest) documentCache.delete(oldest)
  }
  promise.catch(() => documentCache.delete(url))
  return promise
}

export function DocumentTemplatePdfCanvas({
  url,
  width,
  pageIndex = 0,
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
        const pdf = await loadPdfDocument(url)
        if (cancelled) return

        const pageNumber = Math.min(Math.max(1, pageIndex + 1), pdf.numPages)
        const page = await pdf.getPage(pageNumber)
        // Rotation is normalized on upload; render unrotated so overlay coordinates match.
        const baseViewport = page.getViewport({ scale: 1, rotation: 0 })
        const displayScale = width / baseViewport.width
        const outputScale = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
        const viewport = page.getViewport({ scale: displayScale * outputScale, rotation: 0 })

        const canvas = canvasRef.current
        if (!canvas || cancelled) return

        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`
        canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`

        await page.render({ canvas, viewport }).promise

        if (!cancelled) setRenderState('ready')
      } catch {
        if (!cancelled) setRenderState('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, width, pageIndex])

  if (!url) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute left-0 top-0 block"
      aria-hidden={renderState !== 'ready'}
    />
  )
}
