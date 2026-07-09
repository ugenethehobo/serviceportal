'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useLandingScrollRoot } from '@/components/marketing/landing-scroll-root'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SERVICE_PORTAL_VERSION } from '@/lib/landing-page-config'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#features', label: 'Product' },
  { href: '#pricing', label: 'Pricing' },
]

type LandingNavProps = {
  photoBackground?: boolean
}

export function LandingNav({ photoBackground = false }: LandingNavProps) {
  const scrollRoot = useLandingScrollRoot()
  const [progress, setProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const root = scrollRoot
    if (!root) return

    const onScroll = () => {
      const max = root.scrollHeight - root.clientHeight
      setProgress(max > 0 ? (root.scrollTop / max) * 100 : 0)
      setScrolled(root.scrollTop > 20)
    }

    onScroll()
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => root.removeEventListener('scroll', onScroll)
  }, [scrollRoot])

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] bg-black/5"
        aria-hidden
      >
        <div
          className="h-full bg-[#FF4F00] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 transition-all duration-300 sm:pt-4',
          'supports-[padding:max(0px)]:pt-[max(0.75rem,env(safe-area-inset-top))]'
        )}
      >
        <div
          className={cn(
            'flex w-full max-w-5xl items-center justify-between gap-3 rounded-full border px-3 py-2 transition-all duration-300 sm:px-4 sm:py-2.5',
            photoBackground
              ? scrolled
                ? 'border-white/20 bg-black/55 shadow-2xl shadow-black/40 backdrop-blur-xl'
                : 'border-white/15 bg-black/35 backdrop-blur-md'
              : scrolled
                ? 'border-black/10 bg-white/90 shadow-xl shadow-black/8 backdrop-blur-xl'
                : 'border-black/8 bg-white/70 backdrop-blur-md'
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'text-sm font-bold tracking-tight sm:text-base',
                photoBackground ? 'text-white' : 'text-[#0A0A0A]'
              )}
            >
              ServicePortal
            </span>
            <Badge
              className={cn(
                'h-5 border-0 px-1.5 text-[10px] font-bold sm:text-xs',
                photoBackground
                  ? 'bg-[#FF4F00] text-amber-950'
                  : 'bg-[#FF4F00] text-white'
              )}
            >
              Beta
            </Badge>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-full px-3 py-1.5 text-sm transition-colors',
                  photoBackground
                    ? 'text-white/70 hover:bg-white/10 hover:text-white'
                    : 'text-black/55 hover:bg-black/5 hover:text-[#0A0A0A]'
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                'hidden font-mono text-[10px] lg:inline',
                photoBackground ? 'text-white/45' : 'text-black/35'
              )}
            >
              v{SERVICE_PORTAL_VERSION}
            </span>
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 rounded-full px-3',
                  photoBackground
                    ? 'text-white hover:bg-white/10 hover:text-white'
                    : 'text-[#0A0A0A] hover:bg-black/5'
                )}
              >
                Sign in
              </Button>
            </Link>
            <Link href="/signup?plan=trial">
              <Button
                size="sm"
                className={cn(
                  'h-8 rounded-full px-3',
                  photoBackground
                    ? 'bg-white text-slate-950 hover:bg-white/90'
                    : 'bg-[#0A0A0A] text-white hover:bg-black/85'
                )}
              >
                Start free
              </Button>
            </Link>
          </div>
        </div>
      </header>
    </>
  )
}
