import { notFound } from 'next/navigation'
import { getPublicBookingPageAction } from '@/app/booking-actions'
import { PublicBookingPageClient } from '@/components/booking/public-booking-page-client'
import { getBookingDateOptions } from '@/lib/booking-slots'

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ companySlug: string }>
}) {
  const { companySlug } = await params
  const result = await getPublicBookingPageAction(companySlug)

  if (!result.success) {
    notFound()
  }

  const dateOptions =
    result.data.bookingMode === 'online_booking'
      ? getBookingDateOptions(result.data.timezone, result.data.bookingSettings)
      : []

  return (
    <PublicBookingPageClient
      slug={companySlug}
      data={result.data}
      dateOptions={dateOptions}
    />
  )
}