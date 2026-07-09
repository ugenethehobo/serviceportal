import { LANDING_MARQUEE_ITEMS } from '@/lib/landing-page-config'

export function LandingMarquee() {
  const items = [...LANDING_MARQUEE_ITEMS, ...LANDING_MARQUEE_ITEMS]

  return (
    <div className="landing-marquee-band border-y border-black/8 bg-[#0A0A0A] py-4 text-white">
      <div className="overflow-hidden">
        <div className="landing-marquee-track flex w-max items-center gap-10 px-6">
          {items.map((item, index) => (
            <span
              key={`${item}-${index}`}
              className="flex items-center gap-10 whitespace-nowrap text-sm font-medium tracking-wide uppercase"
            >
              {item}
              <span className="text-[#FF4F00]" aria-hidden>
                ✦
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}