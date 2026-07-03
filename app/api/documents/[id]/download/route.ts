import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getDocumentSignedUrl } from '@/lib/estimates-server'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAdmin = createSupabaseAdmin()

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id, client_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const { data: document, error } = await supabaseAdmin
      .from('client_documents')
      .select('storage_path, name, company_id, client_id')
      .eq('id', id)
      .single()

    if (error || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const isStaff =
      profile.role === 'company_admin' || profile.role === 'team_member'
    const isClientOwner =
      profile.role === 'client' && profile.client_id === document.client_id

    if (isStaff) {
      if (!profile.company_id || document.company_id !== profile.company_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } else if (isClientOwner) {
      const { data: client } = await supabaseAdmin
        .from('clients')
        .select('portal_enabled')
        .eq('id', profile.client_id)
        .single()
      if (!client?.portal_enabled) {
        return NextResponse.json({ error: 'Portal access disabled' }, { status: 403 })
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const signedUrl = await getDocumentSignedUrl(document.storage_path)

    return NextResponse.redirect(signedUrl)
  } catch (error: any) {
    console.error('document download error:', error)
    return NextResponse.json({ error: error.message || 'Download failed' }, { status: 500 })
  }
}