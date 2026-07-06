'use client'

import { DateTimePicker } from '@/components/ui/datetime-picker'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface JobFormValues {
  title: string
  description: string
  startTime: string
  endTime: string
  crewId: string
  recurrence: string
  price: string
}

interface Crew {
  id: string
  name: string
}

interface JobFormFieldsProps {
  values: JobFormValues
  onChange: (values: JobFormValues) => void
  availableCrews: Crew[]
  conflictInfo?: { message: string; suggestedCrews?: Crew[] } | null
  onStartTimeChange: (startTime: string) => void
  onEndTimeChange: (endTime: string) => void
  onCrewChange: (crewId: string) => void
  showRecurrence?: boolean
  disabledFields?: Partial<Record<keyof JobFormValues, boolean>>
  isSoloBusiness?: boolean
  soloCrewName?: string | null
}

export function JobFormFields({
  values,
  onChange,
  availableCrews,
  conflictInfo,
  onStartTimeChange,
  onEndTimeChange,
  onCrewChange,
  showRecurrence = true,
  disabledFields = {},
  isSoloBusiness = false,
  soloCrewName,
}: JobFormFieldsProps) {
  const isDisabled = (field: keyof JobFormValues) => disabledFields[field] ?? false

  return (
    <div className="space-y-4">
      {conflictInfo && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md text-sm">
          <p className="font-medium">{conflictInfo.message}</p>
          {conflictInfo.suggestedCrews && conflictInfo.suggestedCrews.length > 0 && (
            <div className="mt-2">
              <p className="font-medium">Suggested crews:</p>
              <ul className="list-disc pl-5">
                {conflictInfo.suggestedCrews.map((crew) => (
                  <li key={crew.id}>{crew.name}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div>
        <Label>Job Title *</Label>
        <Input
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          disabled={isDisabled('title')}
        />
      </div>

      <div>
        <Label>Description</Label>
        <Textarea
          value={values.description}
          onChange={(e) => onChange({ ...values, description: e.target.value })}
          disabled={isDisabled('description')}
          className="min-h-[70px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <div>
          <Label>Start *</Label>
          <DateTimePicker
            value={values.startTime}
            onChange={onStartTimeChange}
            disabled={isDisabled('startTime')}
          />
        </div>
        <div>
          <Label>End *</Label>
          <DateTimePicker
            value={values.endTime}
            onChange={onEndTimeChange}
            disabled={isDisabled('endTime')}
          />
        </div>
      </div>

      <div>
        <Label>Job Price</Label>
        <div className="relative">
          <span className="absolute left-3 top-1 text-muted-foreground">$</span>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={values.price}
            onChange={(e) => onChange({ ...values, price: e.target.value })}
            disabled={isDisabled('price')}
            className="pl-5"
            placeholder="0.00"
          />
        </div>
      </div>

      {showRecurrence && (
        <div>
          <Label>Recurrence</Label>
          <Select
            value={values.recurrence}
            onValueChange={(value) => onChange({ ...values, recurrence: value ?? 'none' })}
            disabled={isDisabled('recurrence')}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {values.recurrence === 'none' && 'One-time'}
                {values.recurrence === 'daily' && 'Daily'}
                {values.recurrence === 'weekly' && 'Weekly'}
                {values.recurrence === 'monthly' && 'Monthly'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="none">One-time</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isSoloBusiness ? (
        <div>
          <Label>Assigned to</Label>
          <p className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {soloCrewName || 'Owner'} (solo business — jobs assign to you automatically)
          </p>
        </div>
      ) : (
        <div>
          <Label>Assign Crew</Label>
          <Select
            value={values.crewId}
            onValueChange={(value) => onCrewChange(value ?? '')}
            disabled={isDisabled('crewId')}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {values.crewId
                  ? availableCrews.find((crew) => crew.id === values.crewId)?.name
                  : 'Unassigned'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {availableCrews.map((crew) => (
                <SelectItem key={crew.id} value={crew.id}>
                  {crew.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}