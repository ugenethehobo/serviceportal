'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatServicePackageSummary, type ServicePackage } from '@/lib/service-packages'
import { cn } from '@/lib/utils'

type ServicePackageRequestSelectorProps = {
  packages: ServicePackage[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function ServicePackageRequestSelector({
  packages,
  selectedIds,
  onChange,
}: ServicePackageRequestSelectorProps) {
  if (packages.length === 0) {
    return null
  }

  const togglePackage = (packageId: string, checked: boolean) => {
    if (checked) {
      onChange([...selectedIds, packageId])
      return
    }
    onChange(selectedIds.filter((id) => id !== packageId))
  }

  return (
    <div className="space-y-2">
      <Label>Services needed</Label>
      <p className="text-xs text-muted-foreground">
        Select one or more services. Optional if you describe your request in the notes.
      </p>
      <div className="grid gap-2">
        {packages.map((pkg) => {
          const selected = selectedIds.includes(pkg.id)
          return (
            <label
              key={pkg.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50',
                selected && 'border-primary bg-primary/5'
              )}
            >
              <Checkbox
                checked={selected}
                onCheckedChange={(checked) => togglePackage(pkg.id, checked === true)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{pkg.name}</p>
                {pkg.description ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground mt-0.5">
                    {pkg.description}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatServicePackageSummary(pkg)}
                </p>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}