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
    const { url } = await getAuthorizedDocumentSignedUrl(id)
    return NextResponse.redirect(url)
  } catch (error: unknown) {
    if (error instanceof DocumentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : 'Download failed'
    console.error('document download error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}