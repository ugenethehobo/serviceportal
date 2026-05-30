'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, Loader2 } from 'lucide-react'

function SubscribeButton({ plan, label }: { plan: 'monthly' | 'annual'; label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Request failed')
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'No checkout URL returned')
      }
    } catch (err: any) {
      console.error('Checkout error:', err)
      setError(err.message || 'Failed to start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button
        onClick={handleSubscribe}
        className="w-full rounded-none h-12 text-base"
        size="lg"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting to checkout...
          </>
        ) : (
          label
        )}
      </Button>

      {error && (
        <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 p-3 rounded-none">
          {error}
        </div>
      )}
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Nav */}
      <nav className="border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg tracking-[-1px]">SP</span>
            </div>
            <div className="font-semibold tracking-widest text-lg">SERVICEPORTAL</div>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" size="sm" className="rounded-none">
                Log in
              </Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="rounded-none">
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Full-screen Modern Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden pt-16 pb-16 md:pb-24">
        {/* Moving texture background - subtle blurred gradients + dots */}
        <div className="absolute inset-0 -z-10">
          {/* Soft drifting gradient blobs (blurs + gradients) */}
          <div className="absolute -top-32 -left-40 h-[520px] w-[520px] rounded-full bg-primary/10 blur-[120px] animate-[drift_32s_ease-in-out_infinite]" />
          <div className="absolute top-1/3 -right-48 h-[620px] w-[620px] rounded-full bg-muted-foreground/10 blur-[140px] animate-[drift_38s_ease-in-out_infinite_8s]" />
          <div className="absolute bottom-[-120px] left-1/3 h-[480px] w-[480px] rounded-full bg-primary/5 blur-[100px] animate-[drift_27s_ease-in-out_infinite_14s]" />

          {/* Very faint moving dot texture for depth */}
          <div className="absolute inset-0 bg-[radial-gradient(currentColor_0.6px,transparent_1px)] bg-[length:5px_5px] opacity-[0.035] text-foreground" />
        </div>

        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs tracking-[2px] uppercase mb-6 text-muted-foreground">
            Built for field service professionals
          </div>

          <h1 className="text-6xl md:text-7xl font-semibold tracking-[-3.5px] leading-[0.95] mb-6">
            Client portals<br />that actually<br />feel professional.
          </h1>

          <p className="max-w-2xl mx-auto text-2xl text-muted-foreground mb-10 tracking-tight">
            Start with your first <span className="font-semibold text-foreground">3 clients completely free</span>.<br />
            No credit card required. Upgrade only when you grow.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#pricing">
              <Button size="lg" className="rounded-none px-10 text-base h-14 w-full sm:w-auto">
                Start for free
              </Button>
            </a>
            <a href="#pricing">
              <Button variant="outline" size="lg" className="rounded-none px-10 text-base h-14 w-full sm:w-auto">
                See plans &amp; pricing
              </Button>
            </a>
          </div>

          <p className="text-sm text-muted-foreground mt-8">
            No hidden fees • Cancel anytime • Instant setup
          </p>
        </div>

        {/* Scroll hint - now in flow so it's always visible within the hero */}
        <div className="mt-auto pt-12 md:pt-16 hidden md:flex flex-col items-center text-center">
          <div className="text-xs tracking-[2px] uppercase text-muted-foreground">Scroll to see pricing</div>
          <div className="mt-1.5 h-px w-8 bg-muted-foreground/40" />
        </div>
      </section>

      {/* Pricing Section */}
      <div id="pricing" className="max-w-6xl mx-auto px-6 pb-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-semibold tracking-tighter">Choose your plan</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Free Starter */}
          <Card className="rounded-none border-2 flex flex-col">
            <CardHeader>
              <CardTitle className="text-2xl">Free</CardTitle>
              <CardDescription className="text-base">Perfect to get started</CardDescription>
              <div className="mt-6">
                <span className="text-5xl font-semibold tracking-tighter">$0</span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">3 clients included</div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 mb-8 text-sm flex-1">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Up to 3 clients</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Unlimited jobs for those clients</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Branded client portal</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Basic online payments</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Photos &amp; documents</span>
                </div>
              </div>
              <div className="mt-auto">
                <Link href="/login" className="block">
                  <Button className="w-full rounded-none h-12 text-base" size="lg">
                    Get started for free
                  </Button>
                </Link>
                <p className="text-center text-xs text-muted-foreground mt-3">
                  No credit card required
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Paid Plans */}
          <div className="space-y-6">
            {/* Monthly */}
            <Card className="rounded-none border-2 flex flex-col">
              <CardHeader className="pb-4">
                <CardTitle className="text-2xl">Monthly</CardTitle>
                <div className="mt-4 flex items-baseline">
                  <span className="text-5xl font-semibold tracking-tighter">$60</span>
                  <span className="text-muted-foreground ml-2">/ month</span>
                </div>
              </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 mb-8 text-sm flex-1">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Unlimited clients &amp; jobs</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Everything in Free</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Priority email support</span>
                </div>
              </div>
              <div className="mt-auto">
                <SubscribeButton plan="monthly" label="Subscribe monthly" />
              </div>
            </CardContent>
          </Card>

          {/* Annual - Recommended */}
          <Card className="rounded-none border-2 border-primary flex flex-col relative">
            <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-[10px] font-semibold tracking-widest px-3 py-0.5">
              BEST VALUE
            </div>

            <CardHeader>
              <CardTitle className="text-2xl">Annual</CardTitle>
              <CardDescription className="text-base">Billed yearly. Save 2 months.</CardDescription>
              <div className="mt-6 flex items-baseline">
                <span className="text-5xl font-semibold tracking-tighter">$600</span>
                <span className="text-muted-foreground ml-2">/ year</span>
              </div>
              <div className="text-sm text-emerald-600 font-medium mt-1">$50/month • Save $120/year</div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 mb-8 text-sm flex-1">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Everything in Monthly</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Priority support</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Early access to new features</span>
                </div>
              </div>

              <div className="mt-auto">
                <SubscribeButton plan="annual" label="Subscribe annually" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="max-w-2xl mx-auto mt-12 text-center text-sm text-muted-foreground">
          All plans include unlimited users, branded client portal, online payments, contracts, photos, and route planning.
          <br />Cancel or downgrade anytime.
        </div>
      </div>

      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-muted-foreground tracking-widest">
          © {new Date().getFullYear()} ServicePortal — Built for service professionals
        </div>
      </footer>
    </div>
  )
}
