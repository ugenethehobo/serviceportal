'use client'

import { useRouter } from 'next/navigation'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function TrialExpiredPage() {
  const router = useRouter()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Clock className="size-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-semibold">Free trial ended</h1>
        <p className="text-sm text-muted-foreground">
          Your company&apos;s 14-day trial has expired. Ask your company admin to choose a
          subscription plan to restore access.
        </p>
        <Button variant="outline" onClick={() => router.push('/dashboard/settings')}>
          Account settings
        </Button>
      </Card>
    </div>
  )
}