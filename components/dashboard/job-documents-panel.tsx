'use client'

import { FolderDocumentsPanel } from '@/components/dashboard/folder-documents-panel'

interface JobDocumentsPanelProps {
  scheduleId: string
  clientId: string
}

export function JobDocumentsPanel({ scheduleId, clientId }: JobDocumentsPanelProps) {
  return (
    <FolderDocumentsPanel
      clientId={clientId}
      scheduleId={scheduleId}
      title="Job Documents"
      description="Files for this job, grouped by category folder. Invoice PDFs appear under Invoices once billing has line items."
    />
  )
}