'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { toEditableServicePackage, type ServicePackageDraft } from '@/lib/service-packages'
import type { ServicePackage } from '@/lib/service-packages'
import { Plus, Trash2 } from 'lucide-react'

type ServicePackagesEditorProps = {
  packages: ServicePackageDraft[]
  onChange: (packages: ServicePackageDraft[]) => void
}

export function draftsFromPackages(packages: ServicePackage[]): ServicePackageDraft[] {
  return packages.length > 0
    ? packages.map((pkg) => toEditableServicePackage(pkg))
    : [toEditableServicePackage()]
}

export function ServicePackagesEditor({ packages, onChange }: ServicePackagesEditorProps) {
  const updatePackage = (index: number, patch: Partial<ServicePackageDraft>) => {
    onChange(
      packages.map((pkg, pkgIndex) => (pkgIndex === index ? { ...pkg, ...patch } : pkg))
    )
  }

  return (
    <div className="space-y-3">
      {packages.map((pkg, index) => (
        <div key={pkg.id || `new-${index}`} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={pkg.active}
                onCheckedChange={(checked) => updatePackage(index, { active: checked })}
              />
              <span className="text-sm">{pkg.active ? 'Active' : 'Hidden'}</span>
            </div>
            {packages.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(packages.filter((_, pkgIndex) => pkgIndex !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Package name</Label>
              <Input
                value={pkg.name}
                onChange={(event) => updatePackage(index, { name: event.target.value })}
                className="mt-1"
                placeholder="Standard cleaning"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={pkg.description}
                onChange={(event) => updatePackage(index, { description: event.target.value })}
                className="mt-1 min-h-[72px]"
                placeholder="What is included in this package?"
                rows={3}
              />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={15}
                max={480}
                step={15}
                value={pkg.duration_minutes}
                onChange={(event) =>
                  updatePackage(index, {
                    duration_minutes: Number(event.target.value) || 60,
                  })
                }
                className="mt-1"
              />
            </div>
            <div>
              <Label>Default price (optional)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={pkg.price_estimate}
                onChange={(event) =>
                  updatePackage(index, { price_estimate: event.target.value })
                }
                className="mt-1"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...packages, toEditableServicePackage()])}
      >
        <Plus className="size-4 mr-2" />
        Add package
      </Button>
    </div>
  )
}