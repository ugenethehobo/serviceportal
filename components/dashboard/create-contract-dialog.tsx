'use client'

import { useEffect, useState } from 'react'
import { createContractAction, getContractCreationOptionsAction } from '@/app/contract-actions'
import { PdfDropZone } from '@/components/dashboard/pdf-drop-zone'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ContractTemplateOption } from '@/lib/contract-templates'
import type { ContractSummary } from '@/lib/contracts'
import { cn } from '@/lib/utils'
import { FileSignature, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const NO_JOB = '__none__'

type CreateContractDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  scheduleId?: string | null
  onCreated: (contract: ContractSummary) => void
}

export function CreateContractDialog({
  open,
  onOpenChange,
  clientId,
  scheduleId = null,
  onCreated,
}: CreateContractDialogProps) {
  const [templates, setTemplates] = useState<ContractTemplateOption[]>([])
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; start_time: string | null }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [source, setSource] = useState<'template' | 'upload'>('template')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [linkedJobId, setLinkedJobId] = useState<string>(scheduleId ?? NO_JOB)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      const result = await getContractCreationOptionsAction(clientId, scheduleId)
      if (cancelled) return
      if (!result.success) {
        toast.error(result.error)
      } else {
        setTemplates(result.templates)
        setJobs(result.jobs)
        setTemplateId(result.suggestedTemplateId ?? result.templates[0]?.id ?? null)
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [open, clientId, scheduleId])

  const reset = () => {
    setIsLoading(true)
    setSource('template')
    setTitle('')
    setFile(null)
    setLinkedJobId(scheduleId ?? NO_JOB)
  }

  const submit = async () => {
    const formData = new FormData()
    formData.append('clientId', clientId)
    const jobId = scheduleId ?? (linkedJobId === NO_JOB ? null : linkedJobId)
    if (jobId) formData.append('scheduleId', jobId)
    if (title.trim()) formData.append('title', title.trim())
    if (source === 'upload') {
      if (!file) {
        toast.error('Choose a PDF to upload')
        return
      }
      formData.append('file', file)
    } else if (templateId) {
      formData.append('templateId', templateId)
    }

    setIsSubmitting(true)
    const result = await createContractAction(formData)
    setIsSubmitting(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Contract draft created')
    reset()
    onCreated(result.contract)
  }

  const selectedTemplate = templates.find((template) => template.id === templateId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New contract</DialogTitle>
          <DialogDescription>
            Start from one of your templates or upload a PDF for just this client. You can fill in
            details and adjust fields before sending.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={source} onValueChange={(value) => setSource(value === 'upload' ? 'upload' : 'template')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="template">From template</TabsTrigger>
            <TabsTrigger value="upload">Upload PDF</TabsTrigger>
          </TabsList>
          <TabsContent value="template" className="mt-3">
            {isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading templates…
              </div>
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setTemplateId(template.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/50',
                      templateId === template.id && 'border-primary bg-primary/5 ring-1 ring-primary/40'
                    )}
                  >
                    {template.sourceType === 'pdf' ? (
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <FileSignature className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{template.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {template.pageCount} {template.pageCount === 1 ? 'page' : 'pages'}
                        {template.staffFieldCount
                          ? ` · ${template.staffFieldCount} ${template.staffFieldCount === 1 ? 'detail' : 'details'} to fill in`
                          : ''}
                        {template.isDefault ? ' · Default' : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="upload" className="mt-3 space-y-2">
            <PdfDropZone
              file={file}
              onFileChange={(next) => {
                setFile(next)
                if (next && !title.trim()) setTitle(next.name.replace(/\.pdf$/i, ''))
              }}
              onError={(message) => toast.error(message)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              After uploading, drag signature and fill-in fields onto the PDF.
            </p>
          </TabsContent>
        </Tabs>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="new-contract-title">Title</Label>
            <Input
              id="new-contract-title"
              value={title}
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={selectedTemplate && source === 'template' ? selectedTemplate.name : 'Service agreement'}
            />
          </div>
          {!scheduleId && jobs.length > 0 ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Job</Label>
              <Select value={linkedJobId} onValueChange={(value) => setLinkedJobId(value ?? NO_JOB)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {linkedJobId === NO_JOB
                      ? 'Not linked to a job'
                      : jobs.find((job) => job.id === linkedJobId)?.title || 'Job'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_JOB}>Not linked to a job</SelectItem>
                  {jobs.map((job) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                      {job.start_time ? ` · ${new Date(job.start_time).toLocaleDateString()}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            onClick={() => void submit()}
            disabled={
              isSubmitting || isLoading || (source === 'upload' ? !file : !templateId)
            }
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
