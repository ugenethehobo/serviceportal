import { redirect } from 'next/navigation'

/** Legacy route — payment lives on the job detail page. */
export default async function PortalJobPayRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/portal/jobs/${id}?pay=1`)
}