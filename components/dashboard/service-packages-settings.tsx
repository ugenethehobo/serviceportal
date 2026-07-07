'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getServicePackagesAction,
  updateServicePackagesAction,
} from '@/app/service-package-actions'
import { Button } from '@/components/ui/button'
import {
  draftsFromPackages,
  ServicePackagesEditor,
} from '@/components/dashboard/service-packages-editor'
import {
  normalizeServicePackageDraft,
  type ServicePackageDraft,
} from '@/lib/service-packages'
import { Layers3 } from 'lucide-react'
import { toast } from 'sonner'

interface ServicePackagesSettingsProps {
  embedded?: boolean
}

export function ServicePackagesSettings({ embedded = false }: ServicePackagesSettingsProps = {}) {
  const [packages, setPackages] = useState<ServicePackageDraft[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const loadPackages = useCallback(async () => {
    const result = await getServicePackagesAction()
    if (!result.success) {
      toast.error(result.error || 'Failed to load service packages')
      setIsLoading(false)
      return
    }

    setPackages(draftsFromPackages(result.packages))
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void loadPackages()
  }, [loadPackages])

  const handleSave = async () => {
    const normalized = packages
      .map((pkg, index) => normalizeServicePackageDraft(pkg, index))
      .filter((pkg): pkg is NonNullable<typeof pkg> => pkg != null)

    if (normalized.length === 0) {
      toast.error('Add at least one service package with a name')
      return
    }

    setIsSaving(true)
    const result = await updateServicePackagesAction(normalized)
    setIsSaving(false)

    if (!result.success) {
      toast.error(result.error || 'Failed to save service packages')
      return
    }

    toast.success('Service packages saved')
    await loadPackages()
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading service packages…</p>
  }

  const content = (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-muted p-2 shrink-0">
          <Layers3 className="size-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold tracking-tight">Service packages</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable service definitions for online booking, request forms, and quick job creation.
            Each package includes a name, optional description, default duration, and price.
          </p>
        </div>
      </div>

      <ServicePackagesEditor packages={packages} onChange={setPackages} />

      <Button type="button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save service packages'}
      </Button>
    </div>
  )

  if (embedded) return content
  return <section className="rounded-lg border bg-card/50 p-4">{content}</section>
}