import Link from 'next/link'
import { isCurrentUserOwner } from '@/lib/authorization'
import { Shield } from 'lucide-react'

export default async function OwnerBanner() {
  const isOwner = await isCurrentUserOwner()

  if (!isOwner) {
    return null
  }

  return (
    <div className="mb-6 border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-sm tracking-tight">
              Platform Owner Mode
            </div>
            <div className="text-sm text-muted-foreground">
              You have access to the owner console for monitoring customers, subscriptions, and platform activity.
            </div>
          </div>
        </div>

        <Link
          href="/owner"
          className="inline-flex items-center justify-center border border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors rounded-none whitespace-nowrap"
        >
          Open Owner Console →
        </Link>
      </div>
    </div>
  )
}
