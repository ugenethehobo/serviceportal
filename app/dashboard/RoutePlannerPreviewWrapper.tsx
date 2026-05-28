'use client'

import dynamic from 'next/dynamic'

const DashboardRoutePreview = dynamic(() => import('./DashboardRoutePreview'), { ssr: false })

interface PreviewPoint {
  lat: number
  lng: number
  title: string
}

interface RoutePlannerPreviewWrapperProps {
  points: PreviewPoint[]
}

export default function RoutePlannerPreviewWrapper({ points }: RoutePlannerPreviewWrapperProps) {
  return <DashboardRoutePreview points={points} />
}
