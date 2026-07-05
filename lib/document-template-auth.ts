import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export class DocumentTemplateAccessError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function verifyCompanyStaffForDocumentTemplates() {
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new DocumentTemplateAccessError('Unauthorized', 401)
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) {
    throw new DocumentTemplateAccessError('Profile not found', 404)
  }

  if (profile.role !== 'company_admin' && profile.role !== 'team_member') {
    throw new DocumentTemplateAccessError('Forbidden', 403)
  }

  return {
    companyId: profile.company_id as string,
    role: profile.role as string,
  }
}