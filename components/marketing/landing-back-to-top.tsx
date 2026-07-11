'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function LandingBackToTop() {
  const scrollRoot = useLandingScrollRoot()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const root = scrollRoot
    if (!root) return

    const onScroll = () => setVisible(root.scrollTop > 320)
    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [scrollRoot])

  if (!visible) return null

  return (
    <Button
      type="button"
      size="icon-lg"
      variant="outline"
      aria-label="Back to top"
      onClick={() => scrollRoot?.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed z-[70] size-11 rounded-full border-black/10 bg-white/90 shadow-lg backdrop-blur-sm',
        'bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))]',
        'hover:bg-white hover:text-[#0A0A0A]'
      )}
    >
      <ArrowUp className="size-5" />
    </Button>
  )
}