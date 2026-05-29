import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user?.email) {
      return NextResponse.json({ isOwner: false })
    }

    const ownerEmails = (process.env.OWNER_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)

    const isOwner = ownerEmails.includes(user.email.toLowerCase())

    return NextResponse.json({ isOwner })
  } catch {
    return NextResponse.json({ isOwner: false })
  }
}
