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

export type AuthorizedDocument = {
  id: string
  storage_path: string
  name: string
  file_name: string | null
  file_type: string
}

export class DocumentAccessError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function getAuthorizedDocument(
  documentId: string
): Promise<AuthorizedDocument> {
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
    throw new DocumentAccessError('Unauthorized', 401)
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('company_id, client_id, role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    throw new DocumentAccessError('Profile not found', 404)
  }

  const { data: document, error } = await supabaseAdmin
    .from('client_documents')
    .select('id, storage_path, name, file_name, file_type, company_id, client_id')
    .eq('id', documentId)
    .single()

  if (error || !document) {
    throw new DocumentAccessError('Document not found', 404)
  }

  const isStaff =
    profile.role === 'company_admin' || profile.role === 'team_member'
  const isClientOwner =
    profile.role === 'client' && profile.client_id === document.client_id

  if (isStaff) {
    if (!profile.company_id || document.company_id !== profile.company_id) {
      throw new DocumentAccessError('Forbidden', 403)
    }
  } else if (isClientOwner) {
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('portal_enabled')
      .eq('id', profile.client_id)
      .single()
    if (!client?.portal_enabled) {
      throw new DocumentAccessError('Portal access disabled', 403)
    }
  } else {
    throw new DocumentAccessError('Forbidden', 403)
  }

  return {
    id: document.id,
    storage_path: document.storage_path,
    name: document.name,
    file_name: document.file_name,
    file_type: document.file_type,
  }
}

export async function getAuthorizedDocumentSignedUrl(documentId: string) {
  const document = await getAuthorizedDocument(documentId)
  const url = await getDocumentSignedUrl(document.storage_path)
  return { document, url }
}