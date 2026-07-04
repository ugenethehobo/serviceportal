export function formatInvoiceNumber(scheduleId: string, invoiceDate: string): string {
  const date = new Date(invoiceDate)
  const ymd = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('')
  return `INV-${ymd}-${scheduleId.slice(0, 8).toUpperCase()}`
}