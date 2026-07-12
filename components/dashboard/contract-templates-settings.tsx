'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  deleteServicePackageContractTemplateAction,
  ensureServicePackageContractTemplateAction,
  getContractTemplatesPageDataAction,
} from '@/app/contract-template-actions'
import { ContractTemplateEditor } from '@/components/dashboard/contract-template-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { ContractTemplateListItem, ContractTemplatesPageData } from '@/lib/contract-templates'
import { FileSignature, Loader2, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type EditorState = {
  templateId: string
  label: string
  usesCatchAll: boolean
}

export function ContractTemplatesSettings() {
  const [data, setData] = useState<ContractTemplatesPageData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    const result = await getContractTemplatesPageDataAction()
    if (!result.success) {
      toast.error(result.error || 'Failed to load contract templates')
      setIsLoading(false)
      return
    }

    setData(result.data)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openEditor = useCallback(
    async (item: ContractTemplateListItem) => {
      if (item.usesCatchAll && item.servicePackageId && item.servicePackageName) {
        setBusyId(item.servicePackageId)
        const result = await ensureServicePackageContractTemplateAction(
          item.servicePackageId,
          item.servicePackageName
        )
        setBusyId(null)

        if (!result.success) {
          toast.error(result.error || 'Failed to create package template')
          return
        }

        setEditor({
          templateId: result.templateId,
          label: item.name,
          usesCatchAll: false,
        })
        void loadData()
        return
      }

      setEditor({
        templateId: item.id,
        label: item.name,
        usesCatchAll: item.usesCatchAll,
      })
    },
    [loadData]
  )

  const handleRemoveOverride = useCallback(
    async (item: ContractTemplateListItem) => {
      if (item.usesCatchAll || !item.servicePackageId) return

      setBusyId(item.id)
      const result = await deleteServicePackageContractTemplateAction(item.id)
      setBusyId(null)

      if (!result.success) {
        toast.error(result.error || 'Failed to remove package template')
        return
      }

      toast.success('Package now uses the catch-all contract template')
      void loadData()
    },
    [loadData]
  )

  if (editor) {
    return (
      <ContractTemplateEditor
        templateId={editor.templateId}
        templateLabel={editor.label}
        usesCatchAll={editor.usesCatchAll}
        onBack={() => {
          setEditor(null)
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <FileSignature className="size-5 shrink-0" />
          Contract templates
        </h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Create a catch-all contract layout and optional overrides for each service package. Templates
          support merge fields, signature and initials boxes, and fillable text fields for clients.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Catch-all template</h3>
        <TemplateRow
          item={data.defaultTemplate}
          busy={busyId === data.defaultTemplate.id}
          onEdit={() => void openEditor(data.defaultTemplate)}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Service package templates</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Packages without a custom template use the catch-all layout when a contract is created.
          </p>
        </div>

        {data.packageTemplates.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">
            Add service packages in Settings to create package-specific contract templates.
          </Card>
        ) : (
          <div className="space-y-2">
            {data.packageTemplates.map((item) => (
              <TemplateRow
                key={item.servicePackageId || item.id}
                item={item}
                busy={busyId === item.id || busyId === item.servicePackageId}
                onEdit={() => void openEditor(item)}
                onRemoveOverride={
                  !item.usesCatchAll ? () => void handleRemoveOverride(item) : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function TemplateRow({
  item,
  busy,
  onEdit,
  onRemoveOverride,
}: {
  item: ContractTemplateListItem
  busy: boolean
  onEdit: () => void
  onRemoveOverride?: () => void
}) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium truncate">{item.name}</p>
          {item.scope === 'default' ? (
            <Badge variant="secondary">Catch-all</Badge>
          ) : item.usesCatchAll ? (
            <Badge variant="outline">Uses catch-all</Badge>
          ) : (
            <Badge>Custom</Badge>
          )}
          {item.servicePackageName ? (
            <span className="text-xs text-muted-foreground">{item.servicePackageName}</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Updated {new Date(item.updatedAt).toLocaleString()}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {onRemoveOverride ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onRemoveOverride}
          >
            <Trash2 className="size-4" />
            Use catch-all
          </Button>
        ) : null}
        <Button type="button" size="sm" disabled={busy} onClick={onEdit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
          {item.usesCatchAll ? 'Customize' : 'Edit template'}
        </Button>
      </div>
    </Card>
  )
}