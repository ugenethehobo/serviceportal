'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  assignServicePackageContractTemplateAction,
  createContractTemplateFromPdfAction,
  createContractTemplateFromStarterAction,
  deleteContractTemplateAction,
  duplicateContractTemplateAction,
  getContractTemplatesPageDataAction,
  setDefaultContractTemplateAction,
} from '@/app/contract-template-actions'
import { ContractTemplateEditor } from '@/components/dashboard/contract-template-editor'
import { PdfDropZone } from '@/components/dashboard/pdf-drop-zone'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CONTRACT_STARTER_DISCLAIMER,
  CONTRACT_STARTERS,
  type ContractStarterId,
} from '@/lib/contract-template-library'
import type { ContractTemplateListItem, ContractTemplatesPageData } from '@/lib/contract-templates'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  Copy,
  FileSignature,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

const DEFAULT_PACKAGE_VALUE = '__default__'

export function ContractTemplatesSettings() {
  const [data, setData] = useState<ContractTemplatesPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ContractTemplateListItem | null>(null)

  const loadData = useCallback(async () => {
    const result = await getContractTemplatesPageDataAction()
    if (!result.success) {
      toast.error(result.error || 'Failed to load contract templates')
    } else {
      setData(result.data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void getContractTemplatesPageDataAction().then((result) => {
      if (cancelled) return
      if (result.success) setData(result.data)
      else toast.error(result.error || 'Failed to load contract templates')
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const runTemplateAction = async (
    templateId: string,
    action: () => Promise<{ success: true } | { success: false; error: string }>,
    successMessage: string
  ) => {
    setBusyId(templateId)
    const result = await action()
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error)
      return false
    }
    toast.success(successMessage)
    void loadData()
    return true
  }

  const handleDuplicate = async (item: ContractTemplateListItem) => {
    setBusyId(item.id)
    const result = await duplicateContractTemplateAction(item.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    toast.success('Template duplicated')
    void loadData()
  }

  const handleAssignPackage = async (packageId: string, value: string | null) => {
    const templateId = !value || value === DEFAULT_PACKAGE_VALUE ? null : value
    setBusyId(packageId)
    const result = await assignServicePackageContractTemplateAction(packageId, templateId)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setData((current) =>
      current
        ? {
            ...current,
            servicePackages: current.servicePackages.map((pkg) =>
              pkg.id === packageId ? { ...pkg, templateId } : pkg
            ),
          }
        : current
    )
    void loadData()
  }

  if (editingTemplateId) {
    return (
      <ContractTemplateEditor
        templateId={editingTemplateId}
        onBack={() => {
          setEditingTemplateId(null)
          void loadData()
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading contract templates…
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Could not load contract templates.</p>
  }

  const templateNameById = new Map(data.templates.map((item) => [item.id, item.name]))
  const defaultName = templateNameById.get(data.defaultTemplateId) || 'Default template'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <FileSignature className="size-5 shrink-0" />
            Contract templates
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Build contracts from a starter template or upload your own PDF, then drag in signatures,
            client fields, and team fields. Staff pick a template when creating a contract on a job or
            client.
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)} disabled={!data.libraryEnabled}>
          <Plus className="size-4" />
          New template
        </Button>
      </div>

      {!data.libraryEnabled ? (
        <Card className="flex items-start gap-3 border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            Run <code className="rounded bg-muted px-1">supabase/contracts-v2-schema.sql</code> in
            Supabase to enable multiple templates, PDF uploads, and per-contract editing. Your existing
            template keeps working until then.
          </p>
        </Card>
      ) : null}

      <section className="space-y-2">
        {data.templates.map((item) => (
          <TemplateRow
            key={item.id}
            item={item}
            busy={busyId === item.id}
            libraryEnabled={data.libraryEnabled}
            onEdit={() => setEditingTemplateId(item.id)}
            onDuplicate={() => void handleDuplicate(item)}
            onSetDefault={() =>
              void runTemplateAction(
                item.id,
                () => setDefaultContractTemplateAction(item.id),
                `${item.name} is now the default`
              )
            }
            onDelete={() => setPendingDelete(item)}
          />
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Service packages</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            When a job&apos;s title matches a service package, new contracts start from the template
            assigned here. Other jobs use the default ({defaultName}).
          </p>
        </div>

        {data.servicePackages.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Add service packages in Settings to assign package-specific contract templates.
          </Card>
        ) : (
          <Card className="divide-y p-0">
            {data.servicePackages.map((pkg) => (
              <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{pkg.name}</p>
                  {!pkg.active ? <p className="text-xs text-muted-foreground">Inactive</p> : null}
                </div>
                <Select
                  value={pkg.templateId ?? DEFAULT_PACKAGE_VALUE}
                  onValueChange={(value) => void handleAssignPackage(pkg.id, value)}
                  disabled={busyId === pkg.id || !data.libraryEnabled}
                >
                  <SelectTrigger className="w-full sm:w-64">
                    <SelectValue>
                      {pkg.templateId
                        ? templateNameById.get(pkg.templateId) || 'Template'
                        : `Default (${defaultName})`}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_PACKAGE_VALUE}>Default ({defaultName})</SelectItem>
                    {data.templates.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </Card>
        )}
      </section>

      <NewContractTemplateDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(templateId) => {
          setIsCreateOpen(false)
          setEditingTemplateId(templateId)
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pendingDelete?.name}?</DialogTitle>
            <DialogDescription>
              Contracts already created from this template keep their own copy and are not affected.
              Service packages using it will fall back to the default template.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={!pendingDelete || busyId === pendingDelete.id}
              onClick={async () => {
                if (!pendingDelete) return
                const deleted = await runTemplateAction(
                  pendingDelete.id,
                  () => deleteContractTemplateAction(pendingDelete.id),
                  'Template deleted'
                )
                if (deleted) setPendingDelete(null)
              }}
            >
              Delete template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TemplateRow({
  item,
  busy,
  libraryEnabled,
  onEdit,
  onDuplicate,
  onSetDefault,
  onDelete,
}: {
  item: ContractTemplateListItem
  busy: boolean
  libraryEnabled: boolean
  onEdit: () => void
  onDuplicate: () => void
  onSetDefault: () => void
  onDelete: () => void
}) {
  const { summary } = item
  const details = [
    `${summary.pageCount} ${summary.pageCount === 1 ? 'page' : 'pages'}`,
    `${summary.signatures} signing ${summary.signatures === 1 ? 'box' : 'boxes'}`,
    summary.clientFields ? `${summary.clientFields} client ${summary.clientFields === 1 ? 'field' : 'fields'}` : null,
    summary.staffFields ? `${summary.staffFields} team ${summary.staffFields === 1 ? 'field' : 'fields'}` : null,
  ].filter(Boolean)

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 rounded-md bg-muted p-2">
          {item.sourceType === 'pdf' ? <FileText className="size-4" /> : <FileSignature className="size-4" />}
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{item.name}</p>
            {item.isDefault ? <Badge variant="secondary">Default</Badge> : null}
            <Badge variant="outline">{item.sourceType === 'pdf' ? 'Uploaded PDF' : 'Builder'}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {details.join(' · ')}
            {item.servicePackageNames.length ? ` · Used by ${item.servicePackageNames.join(', ')}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">Updated {new Date(item.updatedAt).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onEdit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }))}
            disabled={busy || !libraryEnabled}
            aria-label={`More actions for ${item.name}`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            {!item.isDefault ? (
              <>
                <DropdownMenuItem onClick={onSetDefault}>
                  <Star className="size-4" />
                  Make default
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onDelete}>
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  )
}

function NewContractTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (templateId: string) => void
}) {
  const [tab, setTab] = useState<'starter' | 'upload'>('starter')
  const [starterId, setStarterId] = useState<ContractStarterId>('service-agreement')
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const reset = () => {
    setTab('starter')
    setStarterId('service-agreement')
    setName('')
    setFile(null)
  }

  const submit = async () => {
    setIsSubmitting(true)
    try {
      if (tab === 'upload') {
        if (!file) {
          toast.error('Choose a PDF to upload')
          return
        }
        const formData = new FormData()
        formData.append('file', file)
        if (name.trim()) formData.append('name', name.trim())
        const result = await createContractTemplateFromPdfAction(formData)
        if (!result.success) {
          toast.error(result.error)
          return
        }
        toast.success('PDF uploaded. Drag fields onto it next.')
        reset()
        onCreated(result.templateId)
        return
      }

      const result = await createContractTemplateFromStarterAction(starterId, name.trim() || undefined)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Template created')
      reset()
      onCreated(result.templateId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New contract template</DialogTitle>
          <DialogDescription>
            Start from a built-in template or upload a PDF you already use.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value === 'upload' ? 'upload' : 'starter')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="starter">Built-in templates</TabsTrigger>
            <TabsTrigger value="upload">Upload PDF</TabsTrigger>
          </TabsList>
          <TabsContent value="starter" className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {CONTRACT_STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => setStarterId(starter.id)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                    starterId === starter.id && 'border-primary bg-primary/5 ring-1 ring-primary/40'
                  )}
                >
                  <p className="text-sm font-medium">{starter.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{starter.description}</p>
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{CONTRACT_STARTER_DISCLAIMER}</p>
          </TabsContent>
          <TabsContent value="upload" className="mt-3 space-y-2">
            <PdfDropZone
              file={file}
              onFileChange={(next) => {
                setFile(next)
                if (next && !name.trim()) setName(next.name.replace(/\.pdf$/i, ''))
              }}
              onError={(message) => toast.error(message)}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Fillable form fields in the PDF are flattened. You&apos;ll place signature and fill-in
              fields in the next step.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label htmlFor="new-template-name">Template name</Label>
          <Input
            id="new-template-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              tab === 'starter'
                ? CONTRACT_STARTERS.find((starter) => starter.id === starterId)?.name
                : 'Uploaded contract'
            }
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={() => void submit()} disabled={isSubmitting || (tab === 'upload' && !file)}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {tab === 'upload' ? 'Upload and place fields' : 'Create and edit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
