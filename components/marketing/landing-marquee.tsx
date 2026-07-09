import { LANDING_MARQUEE_ITEMS } from '@/lib/landing-page-config'
import { Minus } from 'lucide-react'

export function LandingMarquee() {
  return (
    <section
      aria-label="Supported service trades"
      className="border-y border-black/8 bg-[#0A0A0A] px-4 py-4 text-white sm:px-6 sm:py-5"
    >
      <ul className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 sm:gap-x-5 sm:gap-y-3">
        {LANDING_MARQUEE_ITEMS.map((item, index) => (
          <li key={item} className="inline-flex items-center gap-3 sm:gap-5">
            <span className="whitespace-nowrap text-xs font-medium tracking-wide uppercase text-white/90 sm:text-sm">
              {item}
            </span>
            {index < LANDING_MARQUEE_ITEMS.length - 1 ? (
              <Minus
                className="size-3 shrink-0 text-[#FF4F00] sm:size-3.5"
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}