'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LogOut } from 'lucide-react'
import { AppearanceSettings } from '@/components/appearance-settings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'

export default function AdminSettingsPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground -ml-1"
          >
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Admin settings</h1>
          <p className="text-sm text-muted-foreground">
            Personal preferences for your platform admin account.
          </p>
        </div>
        <Button variant="outline" onClick={() => void handleLogout()} className="gap-2">
          <LogOut className="size-4" />
          Logout
        </Button>
      </div>

      <Card className="p-6">
        <AppearanceSettings embedded canEditCompanyBranding={false} />
      </Card>
    </div>
  )
}