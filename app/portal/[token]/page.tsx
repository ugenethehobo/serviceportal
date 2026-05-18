import { createClient } from '@/lib/supabase/server'
import ClientMessaging from './ClientMessaging'

export default async function ClientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createClient()

  // Validate token
  const { data: tokenData } = await supabase
    .from('portal_tokens')
    .select('client_id, expires_at')
    .eq('token', token)
    .single()

  if (!tokenData || (tokenData.expires_at && new Date(tokenData.expires_at) < new Date())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-6xl mb-6">🔒</div>
          <h1 className="text-3xl font-semibold mb-3">Portal Unavailable</h1>
          <p className="text-gray-600">This link is invalid or has expired.</p>
        </div>
      </div>
    )
  }

  // Get client + jobs
  const [{ data: client }, { data: jobs }] = await Promise.all([
    supabase.from('clients').select('*').eq('id', tokenData.client_id).single(),
    supabase.from('jobs')
      .select(`*, files (*)`)
      .eq('client_id', tokenData.client_id)
      .order('created_at', { ascending: false })
  ])

  if (!client) return <div>Client not found</div>

  const getStatusInfo = (status: string) => {
    const map: any = {
      quote_sent: { label: 'Quote Sent', color: 'bg-yellow-100 text-yellow-700' },
      scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
      in_progress: { label: 'In Progress', color: 'bg-purple-100 text-purple-700' },
      completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
      invoiced: { label: 'Invoiced', color: 'bg-orange-100 text-orange-700' },
      paid: { label: 'Paid', color: 'bg-emerald-100 text-emerald-700' }
    }
    return map[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center">
              <span className="text-white text-2xl font-bold">SP</span>
            </div>
            <div>
              <div className="text-sm text-gray-500">Welcome to</div>
              <div className="text-3xl font-bold">ServicePortal</div>
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-500">Logged in as</div>
            <div className="font-semibold">{client.name}</div>
          </div>
        </div>

        {/* Jobs Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="font-semibold text-2xl">Your Jobs</div>
            <div className="text-sm text-gray-500">{jobs?.length || 0} total</div>
          </div>

          {jobs && jobs.length > 0 ? (
            <div className="space-y-6">
              {jobs.map((job) => {
                const status = getStatusInfo(job.status)
                return (
                  <div key={job.id} className="bg-white rounded-3xl p-8 border">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <div className="font-semibold text-2xl">{job.title}</div>
                        <div className="text-sm text-gray-500 mt-1">
                          {job.scheduled_date && `Scheduled: ${new Date(job.scheduled_date).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className={`${status.color} px-4 py-1.5 rounded-2xl text-sm font-medium`}>
                        {status.label}
                      </div>
                    </div>

                    {job.description && (
                      <div className="text-gray-700 mb-6 leading-relaxed">{job.description}</div>
                    )}

                    {/* Photos */}
                    {job.files && job.files.length > 0 && (
                      <div className="mb-6">
                        <div className="text-sm font-medium text-gray-600 mb-3">Photos</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {job.files.map((photo: any, i: number) => (
                            <div key={i} className="relative">
                              <img src={photo.file_url} className="w-full h-40 object-cover rounded-2xl" />
                              {photo.category && (
                                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                  {photo.category}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-sm pt-4 border-t">
                      <div className="text-gray-500">
                        Created {new Date(job.created_at).toLocaleDateString()}
                      </div>
                      {job.price && <div className="font-semibold text-emerald-600">${job.price}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-16 text-center border">
              <div className="text-6xl mb-4">📋</div>
              <div className="text-xl font-medium">No jobs yet</div>
            </div>
          )}
        </div>

        {/* Messaging Section */}
        <div className="bg-white rounded-3xl shadow-sm p-8 border">
          <div className="font-semibold text-xl mb-6">Messages</div>
          <ClientMessaging clientId={client.id} />
        </div>

        <div className="mt-10 text-center text-xs text-gray-500">
          Secure Client Portal • All communication is private
        </div>
      </div>
    </div>
  )
}
