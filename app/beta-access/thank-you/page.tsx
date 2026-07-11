import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2, Sparkles } from 'lucide-react'

export default function BetaAccessThankYouPage() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#F2EDE4] px-6 text-[#0A0A0A]">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[500px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF4F00]/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-[#FF4F00]/15 ring-1 ring-[#FF4F00]/30">
          <CheckCircle2 className="size-8 text-[#FF4F00]" />
        </div>

        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#FF4F00]/25 bg-[#FF4F00]/10 px-4 py-1.5">
          <Sparkles className="size-3.5 text-[#FF4F00]" />
          <span className="text-xs font-medium tracking-wide text-[#FF4F00]">Request received</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Thanks for your interest!</h1>
        <p className="mt-4 text-base leading-relaxed text-black/55 md:text-lg">
          We&apos;ve received your beta access request and will review it shortly. If you&apos;re a
          good fit, we&apos;ll email you an invitation code to get started on Pro.
        </p>

        <Link
          href="/"
          className={cn(
            buttonVariants({ size: 'lg' }),
            'mt-10 inline-flex h-12 rounded-full bg-[#FF4F00] px-8 text-white hover:bg-[#E64600]'
          )}
        >
          Return to home
        </Link>
      </div>
    </div>
  )
}