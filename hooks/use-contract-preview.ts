'use client'

import { useEffect, useRef, useState } from 'react'

const PREVIEW_DEBOUNCE_MS = 450

/**
 * Renders a contract preview PDF through /api/document-templates/preview whenever the
 * request body changes (debounced), and returns an object URL for the latest render.
 */
export function useContractPreview(body: Record<string, unknown> | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const serialized = body ? JSON.stringify(body) : null

  useEffect(() => {
    if (!serialized) return
    const requestId = ++requestIdRef.current

    const timer = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/document-templates/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: serialized,
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error || 'Failed to render preview')
        }
        const blob = await response.blob()
        // A newer edit already started rendering; drop this stale result.
        if (requestId !== requestIdRef.current) return
        const nextUrl = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = nextUrl
        setPreviewUrl(nextUrl)
        setError(null)
      } catch (caught) {
        if (requestId === requestIdRef.current) {
          setError(caught instanceof Error ? caught.message : 'Failed to render preview')
        }
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false)
      }
    }, PREVIEW_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [serialized])

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  return { previewUrl, isLoading, error }
}
