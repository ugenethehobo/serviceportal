'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  US_STATES,
  type StructuredAddress,
  type StructuredAddressErrors,
} from '@/lib/address'

interface StructuredAddressFormProps {
  value: StructuredAddress
  onChange: (value: StructuredAddress) => void
  errors?: StructuredAddressErrors
  disabled?: boolean
  idPrefix?: string
  required?: boolean
}

export function StructuredAddressForm({
  value,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = 'address',
  required = true,
}: StructuredAddressFormProps) {
  const update = (field: keyof StructuredAddress, fieldValue: string) => {
    onChange({ ...value, [field]: fieldValue })
  }

  const requiredMark = required ? ' *' : ''

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`${idPrefix}-street`}>Street address{requiredMark}</Label>
        <Input
          id={`${idPrefix}-street`}
          value={value.street}
          onChange={(e) => update('street', e.target.value)}
          placeholder="123 Main Street"
          className="mt-1"
          disabled={disabled}
        />
        {errors.street && (
          <p className="text-xs text-red-600 mt-1">{errors.street}</p>
        )}
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-unit`}>Unit / suite / building no. (optional)</Label>
        <Input
          id={`${idPrefix}-unit`}
          value={value.unit}
          onChange={(e) => update('unit', e.target.value)}
          placeholder="Suite 200, Building B"
          className="mt-1"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <Label htmlFor={`${idPrefix}-city`}>City{requiredMark}</Label>
          <Input
            id={`${idPrefix}-city`}
            value={value.city}
            onChange={(e) => update('city', e.target.value)}
            placeholder="Springfield"
            className="mt-1"
            disabled={disabled}
          />
          {errors.city && (
            <p className="text-xs text-red-600 mt-1">{errors.city}</p>
          )}
        </div>

        <div>
          <Label htmlFor={`${idPrefix}-state`}>State{requiredMark}</Label>
          <select
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(e) => update('state', e.target.value)}
            className="w-full border rounded-md px-3 py-2 bg-background mt-1 h-7 text-sm"
            disabled={disabled}
          >
            <option value="">Select state</option>
            {US_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code} — {state.name}
              </option>
            ))}
          </select>
          {errors.state && (
            <p className="text-xs text-red-600 mt-1">{errors.state}</p>
          )}
        </div>

        <div>
          <Label htmlFor={`${idPrefix}-zip`}>ZIP code{requiredMark}</Label>
          <Input
            id={`${idPrefix}-zip`}
            value={value.zip}
            onChange={(e) => update('zip', e.target.value)}
            placeholder="62701"
            inputMode="numeric"
            className="mt-1"
            disabled={disabled}
          />
          {errors.zip && (
            <p className="text-xs text-red-600 mt-1">{errors.zip}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/** @deprecated Use StructuredAddressForm — kept for existing imports */
export function CompanyAddressForm(
  props: Omit<StructuredAddressFormProps, 'idPrefix' | 'required'>
) {
  return <StructuredAddressForm {...props} idPrefix="company" required />
}