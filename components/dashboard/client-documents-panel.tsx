'use client'

import { useState, useEffect, useCallback } from 'react'
import { getClientDocumentsAction } from '@/app/action'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Download, FileText } from 'lucide-react'
import type { ClientDocument } from '@/lib/estimates'

interface ClientDocumentsPanelProps {
  clientId: string
  refreshKey?: number
}

export function ClientDocumentsPanel({ clientId, refreshKey = 0 }: ClientDocumentsPanelProps) {
  const [documents, setDocuments] = useState<ClientDocument[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchDocuments = useCallback(async () => {
    const result = await getClientDocumentsAction(clientId)
    if (result.success) {
      setDocuments((result.documents || []) as ClientDocument[])
    } else {
      toast.error(result.error || 'Failed to load documents')
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    setIsLoading(true)
    fetchDocuments()
  }, [fetchDocuments, refreshKey])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading documents...</div>
  }

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <p className="text-sm text-muted-foreground">
        Estimate PDFs are generated automatically when you create or update an estimate.
      </p>

      {documents.length > 0 ? (
        <div className="scroll-fade border rounded-lg flex-1 min-h-0 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground shrink-0" />
                      <span className="font-medium">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {doc.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`/api/documents/${doc.id}/download`, '_blank')}
                    >
                      <Download className="size-4" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed rounded-lg">
          <p className="text-muted-foreground text-sm">
            No documents yet. Create an estimate to generate a PDF automatically.
          </p>
        </div>
      )}
    </div>
  )
}