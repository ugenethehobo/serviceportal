'use client'

import dynamic from 'next/dynamic'

const BetaFeedbackWidget = dynamic(
  () =>
    import('@/components/beta-feedback/beta-feedback-widget').then((m) => ({
      default: m.BetaFeedbackWidget,
    })),
  { ssr: false }
)

export function BetaFeedbackWidgetLazy() {
  return <BetaFeedbackWidget />
}