export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  quote_sent: '#eab308',
  scheduled: '#3b82f6',
  in_progress: '#8b5cf6',
  completed: '#22c55e',
  invoiced: '#f97316',
  paid: '#10b981',
}

export function getStatusColor(status: string, customColors: Record<string, string> = {}): string {
  return customColors[status] || DEFAULT_STATUS_COLORS[status] || '#64748b'
}
