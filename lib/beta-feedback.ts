export type BetaFeedbackType = 'bug' | 'feature' | 'other'

export type BetaFeedbackStatus = 'new' | 'reviewed' | 'resolved'

export const BETA_FEEDBACK_TYPES: Array<{
  value: BetaFeedbackType
  label: string
  description: string
}> = [
  {
    value: 'bug',
    label: 'Bug report',
    description: 'Something is broken or not working as expected',
  },
  {
    value: 'feature',
    label: 'Feature request',
    description: 'An idea for something new or improved',
  },
  {
    value: 'other',
    label: 'Other feedback',
    description: 'General thoughts, questions, or praise',
  },
]

export const BETA_FEEDBACK_STATUSES: Array<{
  value: BetaFeedbackStatus
  label: string
}> = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'resolved', label: 'Resolved' },
]

export function getBetaFeedbackTypeLabel(type: BetaFeedbackType): string {
  return BETA_FEEDBACK_TYPES.find((entry) => entry.value === type)?.label ?? type
}

export function getBetaFeedbackStatusLabel(status: BetaFeedbackStatus): string {
  return BETA_FEEDBACK_STATUSES.find((entry) => entry.value === status)?.label ?? status
}

export function normalizeBetaFeedbackType(value: string | null | undefined): BetaFeedbackType | null {
  if (value === 'bug' || value === 'feature' || value === 'other') return value
  return null
}

export function normalizeBetaFeedbackStatus(
  value: string | null | undefined
): BetaFeedbackStatus {
  if (value === 'reviewed' || value === 'resolved') return value
  return 'new'
}