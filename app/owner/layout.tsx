import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isCurrentUserOwner } from '@/lib/authorization'

// Simple owner protection using the centralized helper.
// Add OWNER_EMAILS=you@email.com,other@email.com to .env.local (or Vercel env vars)

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const isOwner = await isCurrentUserOwner()

  if (!isOwner) {
    // Not an owner — send them away
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a 
              href="/dashboard" 
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Dashboard
            </a>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg tracking-[-1px]">SP</span>
              </div>
              <div>
                <span className="font-semibold tracking-widest">SERVICEPORTAL</span>
                <span className="ml-2 text-sm text-muted-foreground">Owner Console</span>
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {user.email}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  )
}
