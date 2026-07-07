'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatServicePackageSummary, type ServicePackage } from '@/lib/service-packages'

type ServicePackageTemplatePickerProps = {
  packages: ServicePackage[]
  value: string
  onSelect: (packageId: string) => void
  disabled?: boolean
}

export function ServicePackageTemplatePicker({
  packages,
  value,
  onSelect,
  disabled = false,
}: ServicePackageTemplatePickerProps) {
  if (packages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Add service packages in Settings → Service packages to use job templates.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>Start from a service package</Label>
      <Select
        value={value || undefined}
        onValueChange={(next) => onSelect(next ?? '')}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Choose a package template (optional)" />
        </SelectTrigger>
        <SelectContent>
          {packages.map((pkg) => (
            <SelectItem key={pkg.id} value={pkg.id}>
              {pkg.name} · {formatServicePackageSummary(pkg)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Fills the job title, description, price, and end time (when start time is set).
      </p>
    </div>
  )
}