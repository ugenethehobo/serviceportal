import { NextResponse } from 'next/server'
import {
  DocumentAccessError,
  getAuthorizedDocumentSignedUrl,
} from '@/lib/document-access-server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { document, url } = await getAuthorizedDocumentSignedUrl(id)

    return NextResponse.json({
      url,
      fileType: document.file_type,
      name: document.file_name || document.name,
    })
  } catch (error: unknown) {
    if (error instanceof DocumentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Could not load document'
    console.error('document view error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}