'use client'

import { FolderDocumentsPanel } from '@/components/dashboard/folder-documents-panel'

interface ClientDocumentsPanelProps {
  clientId: string
  refreshKey?: number
  variant?: 'staff' | 'portal'
}

export function ClientDocumentsPanel({
  clientId,
  refreshKey = 0,
  variant = 'staff',
}: ClientDocumentsPanelProps) {
  if (variant === 'portal') {
    return (
      <FolderDocumentsPanel
        clientId={clientId}
        variant="portal"
        refreshKey={refreshKey}
        title="Documents"
        description="Invoices, estimates, and files from your service provider — organized by job."
      />
    )
  }

  return (
    <FolderDocumentsPanel
      clientId={clientId}
      refreshKey={refreshKey}
      title="All Documents"
      description="Every file for this client in one place — job invoices, uploads, and client-level files organized by job folder."
    />
  )
}