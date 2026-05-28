'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Check, ArrowRight, Loader2 } from 'lucide-react'

function SubscribeButton({ plan, label }: { plan: 'monthly' | 'annual'; label: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugClick, setDebugClick] = useState<string>('')

  const handleSubscribe = async () => {
    console.log('%c[DEBUG] SubscribeButton clicked!', 'color: lime; font-size: 14px', { plan })
    setDebugClick(`Clicked ${plan} at ${new Date().toLocaleTimeString()}`)
    setLoading(true)
    setError(null)

    try {
      console.log('[DEBUG] Starting fetch to /api/create-subscription-checkout')
      const res = await fetch('/api/create-subscription-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })

      console.log('[DEBUG] Fetch response status:', res.status)
      const data = await res.json()
      console.log('[DEBUG] Response data:', data)

      if (!res.ok) {
        throw new Error(data.error || 'Request failed')
      }

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'No checkout URL returned')
      }
    } catch (err: any) {
      console.error('[DEBUG] Checkout error:', err)
      setError(err.message || 'Failed to start checkout. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {/* Temporary debug button using native <button> to test if handler fires */}
      <button
        onClick={handleSubscribe}
        disabled={loading}
        style={{
          width: '100%',
          padding: '12px',
          backgroundColor: '#111',
          color: 'white',
          border: '1px solid #333',
          fontSize: '14px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '8px'
        }}
      >
        {loading ? 'Redirecting to checkout...' : `[TEST] ${label}`}
      </button>

      {/* Original styled button (for comparison) */}
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

      {debugClick && (
        <div className="mt-2 text-xs bg-yellow-100 text-yellow-800 p-2 border border-yellow-300 rounded-none font-mono">
          DEBUG: {debugClick}
        </div>
      )}

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
      {/* Top Nav - Sharp */}
      <nav className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
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

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block mb-4 px-3 py-1 text-xs font-semibold tracking-[2px] uppercase border">
          Built for service companies
        </div>

        <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter leading-[1.05] mb-6">
          Professional client portal<br />and job management.
        </h1>

        <p className="max-w-2xl mx-auto text-xl text-muted-foreground mb-10">
          The complete toolkit for plumbers, electricians, HVAC, and field service businesses.
          Branded client experience. Online payments. Zero complexity.
        </p>

        <div className="flex items-center justify-center gap-4">
          <a href="#pricing">
            <Button size="lg" className="rounded-none px-8 text-base">
              View pricing <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </a>
          <Link href="/login">
            <Button variant="outline" size="lg" className="rounded-none px-8 text-base">
              Log in to existing account
            </Button>
          </Link>
        </div>
      </div>

      {/* Trust / Trial Banner */}
      <div className="border-y bg-muted/40">
        <div className="max-w-5xl mx-auto px-6 py-5 text-center text-sm">
          <span className="font-semibold">Start with your first 3 clients completely free.</span> No time limit. Upgrade only when you need more.
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="max-w-5xl mx-auto px-6 pt-16 pb-24">
        <div className="text-center mb-12">
          <div className="text-xs tracking-[3px] font-semibold uppercase mb-2 text-muted-foreground">Simple pricing</div>
          <h2 className="text-4xl font-semibold tracking-tighter">Choose the plan that fits your business</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Monthly Plan */}
          <Card className="rounded-none border-2 flex flex-col">
            <CardHeader className="pb-8">
              <CardTitle className="text-2xl tracking-tight">Monthly</CardTitle>
              <CardDescription className="text-base mt-1">Billed monthly. Cancel anytime.</CardDescription>
              <div className="mt-6 flex items-baseline">
                <span className="text-6xl font-semibold tracking-tighter">$60</span>
                <span className="text-muted-foreground ml-2 text-lg">/ month</span>
              </div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 mb-8 text-sm">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Unlimited clients &amp; jobs after trial</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Branded client portal</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Stripe online payments</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Contracts with e-signature</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Photos, documents &amp; route planning</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Custom branding (logo + color)</span>
                </div>
              </div>

              <div className="mt-auto">
                <SubscribeButton plan="monthly" label="Subscribe monthly" />
                <p className="text-center text-xs text-muted-foreground mt-3">
                  First 3 clients free
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Annual Plan - Recommended */}
          <Card className="rounded-none border-2 border-primary flex flex-col relative">
            <div className="absolute -top-3 right-6 bg-primary text-primary-foreground text-[10px] font-semibold tracking-widest px-4 py-1 rounded-none">
              BEST VALUE
            </div>

            <CardHeader className="pb-8">
              <CardTitle className="text-2xl tracking-tight">Annual</CardTitle>
              <CardDescription className="text-base mt-1">Billed yearly. Save two months.</CardDescription>
              <div className="mt-6 flex items-baseline">
                <span className="text-6xl font-semibold tracking-tighter">$600</span>
                <span className="text-muted-foreground ml-2 text-lg">/ year</span>
              </div>
              <div className="text-sm text-emerald-600 font-medium mt-1">Equivalent to $50/month — save $120</div>
            </CardHeader>

            <CardContent className="flex-1 flex flex-col">
              <div className="space-y-3 mb-8 text-sm">
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Everything in Monthly</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Priority support</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Early access to new features</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Unlimited clients &amp; jobs after trial</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Branded client portal + payments</span>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 mt-1 shrink-0" />
                  <span>Custom branding &amp; route planning</span>
                </div>
              </div>

              <div className="mt-auto">
                <SubscribeButton plan="annual" label="Subscribe annually" />
                <p className="text-center text-xs text-muted-foreground mt-3">
                  First 3 clients free
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trial explanation */}
        <div className="max-w-2xl mx-auto mt-12 text-center text-sm text-muted-foreground">
          <p>
            Start today with your first <span className="font-semibold text-foreground">3 clients completely free</span>. 
            No credit card required until you want to add more. 
            Upgrade anytime to unlock unlimited clients and the full feature set.
          </p>
        </div>
      </div>

      {/* Simple footer */}
      <footer className="border-t py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-muted-foreground tracking-widest">
          © {new Date().getFullYear()} ServicePortal — Built for service professionals
        </div>
      </footer>
    </div>
  )
}
