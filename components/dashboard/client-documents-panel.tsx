'use client'

import { FolderDocumentsPanel } from '@/components/dashboard/folder-documents-panel'

import type { UploadedDocument } from '@/lib/uploaded-documents'

type DocumentJobMeta = { id: string; title: string; start_time: string; status: string }

interface ClientDocumentsPanelProps {
  clientId: string
  refreshKey?: number
  variant?: 'staff' | 'portal'
  initialDocuments?: UploadedDocument[]
  initialJobs?: DocumentJobMeta[]
}

export function ClientDocumentsPanel({
  clientId,
  refreshKey = 0,
  variant = 'staff',
  initialDocuments,
  initialJobs,
}: ClientDocumentsPanelProps) {
  if (variant === 'portal') {
    return (
      <FolderDocumentsPanel
        clientId={clientId}
        variant="portal"
        refreshKey={refreshKey}
        initialDocuments={initialDocuments}
        initialJobs={initialJobs}
        title="Documents"
        description="Invoices, estimates, contracts, and files from your service provider — organized by job."
      />
    )
  }

  return (
    <FolderDocumentsPanel
      clientId={clientId}
      refreshKey={refreshKey}
      initialDocuments={initialDocuments}
      initialJobs={initialJobs}
      title="All Documents"
      description="Every file for this client in one place — job invoices, uploads, and client-level files organized by job folder."
    />
  )
}