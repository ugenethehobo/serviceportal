'use client'

import { useState } from 'react'
import { FolderDocumentsPanel } from '@/components/dashboard/folder-documents-panel'
import { JobContractsSection } from '@/components/dashboard/job-contracts-section'

interface JobDocumentsPanelProps {
  scheduleId: string
  clientId: string
}

export function JobDocumentsPanel({ scheduleId, clientId }: JobDocumentsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <JobContractsSection
        scheduleId={scheduleId}
        clientId={clientId}
        onContractChanged={() => setRefreshKey((key) => key + 1)}
      />
      <FolderDocumentsPanel
        clientId={clientId}
        scheduleId={scheduleId}
        refreshKey={refreshKey}
        title="Job Documents"
        description="Files for this job, grouped by category folder. Contract and invoice PDFs appear in their system folders."
      />
    </div>
  )
}