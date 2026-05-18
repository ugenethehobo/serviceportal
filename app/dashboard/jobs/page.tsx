'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"

interface Job {
  id: string
  title: string
  description: string | null
  status: string
  scheduled_date: string | null
  price: number | null
  client_id: string
  created_at: string
  clients: { name: string } | null
}

interface Client {
  id: string
  name: string
}

interface JobPhoto {
  id: string
  file_url: string
  description: string | null
  category: string
  created_at: string
}

const STATUSES = [
  { value: 'quote_sent', label: 'Quote Sent' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'paid', label: 'Paid' }
]

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [jobPhotos, setJobPhotos] = useState<JobPhoto[]>([])
  const [uploading, setUploading] = useState(false)
  const [photoFilter, setPhotoFilter] = useState('')
  const [filteredPhotos, setFilteredPhotos] = useState<JobPhoto[]>([])
  const [formData, setFormData] = useState({
    client_id: '', title: '', description: '', scheduled_date: '', price: ''
  })

  const supabase = createClient()

  const loadJobs = async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select(`*, clients (name)`)
      .order('created_at', { ascending: false })
    if (!error) setJobs(data || [])
    setLoading(false)
  }

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id, name')
    if (data) setClients(data)
  }

  useEffect(() => {
    loadJobs()
    loadClients()
  }, [])

  useEffect(() => {
  if (photoFilter && photoFilter !== "all") {
    setFilteredPhotos(jobPhotos.filter(p => p.category === photoFilter))
  } else {
    setFilteredPhotos(jobPhotos)
  }
}, [jobPhotos, photoFilter])

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('jobs').insert([{
      ...formData,
      user_id: user.id,
      price: formData.price ? parseFloat(formData.price) : null,
      scheduled_date: formData.scheduled_date || null
    }])

    if (!error) {
      setFormData({ client_id: '', title: '', description: '', scheduled_date: '', price: '' })
      setShowForm(false)
      loadJobs()
    }
  }

  const updateJobStatus = async (jobId: string, newStatus: string) => {
    await supabase.from('jobs').update({ status: newStatus }).eq('id', jobId)
    loadJobs()
  }

  const openJobDetail = async (job: Job) => {
    setSelectedJob(job)
    const { data: photos } = await supabase
      .from('files')
      .select('*')
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
    setJobPhotos(photos || [])
  }

  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedJob) return

    setUploading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const compressedFile = await compressImage(file)
      const fileName = `${selectedJob.id}/${Date.now()}-${file.name}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, compressedFile)

      if (uploadError) {
        alert('Upload failed: ' + uploadError.message)
        setUploading(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName)

      const category = prompt('Photo Category (e.g., Rough-in, Final, Materials, Issues):', 'General') || 'General'

      await supabase.from('files').insert([{
        job_id: selectedJob.id,
        user_id: user.id,
        file_url: publicUrl,
        file_type: 'photo',
        category: category,
        description: file.name
      }])

      const { data: photos } = await supabase
        .from('files')
        .select('*')
        .eq('job_id', selectedJob.id)
        .order('created_at', { ascending: true })

      setJobPhotos(photos || [])
    } catch (err: any) {
      alert('Error: ' + err.message)
    }

    setUploading(false)
  }

  const compressImage = async (file: File): Promise<File> => {
    if (file.size < 1024 * 1024) return file

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')!
      const img = new Image()

      img.onload = () => {
        const maxWidth = 1920
        const scale = Math.min(1, maxWidth / img.width)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        }, 'image/jpeg', 0.85)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const deletePhoto = async (photoId: string, fileUrl: string) => {
    if (!confirm('Delete this photo?')) return

    try {
      const filePath = fileUrl.split('/job-photos/')[1]
      if (filePath) {
        await supabase.storage.from('job-photos').remove([filePath])
      }
      await supabase.from('files').delete().eq('id', photoId)

      const { data: photos } = await supabase
        .from('files')
        .select('*')
        .eq('job_id', selectedJob!.id)
        .order('created_at', { ascending: true })
      setJobPhotos(photos || [])
    } catch (err: any) {
      alert('Error deleting photo: ' + err.message)
    }
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      quote_sent: 'bg-yellow-100 text-yellow-800',
      scheduled: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-purple-100 text-purple-800',
      completed: 'bg-green-100 text-green-800',
      invoiced: 'bg-orange-100 text-orange-800',
      paid: 'bg-emerald-100 text-emerald-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground mt-2">Track all your service jobs</p>
        </div>

        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogTrigger asChild>
            <Button>+ New Job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Job</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateJob} className="space-y-4">
              <Select value={formData.client_id} onValueChange={(value) => setFormData({...formData, client_id: value})} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select Client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Job Title"
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
                required
              />
              <Textarea
                placeholder="Description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="date"
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Price"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">Create Job</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {jobs.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">🔧</div>
              <h3 className="text-xl font-semibold mb-2">No jobs yet</h3>
              <p className="text-muted-foreground mb-6">Create your first job to get started</p>
              <Button onClick={() => setShowForm(true)}>Create Your First Job</Button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Job</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Price</th>
                  <th className="w-20 px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/50">
                    <td className="px-6 py-4">
                      <div className="font-medium">{job.title}</div>
                      {job.description && (
                        <div className="text-sm text-muted-foreground line-clamp-1">{job.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{job.clients?.name}</td>
                    <td className="px-6 py-4">
                      <Select
                        value={job.status}
                        onValueChange={(value) => updateJobStatus(job.id, value)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-6 py-4 font-medium">
                      {job.price ? `$${job.price}` : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <Button variant="ghost" size="sm" onClick={() => openJobDetail(job)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Job Detail Modal with Photos */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
      <DialogContent
className="max-w-[1200px] w-[95vw] max-h-[90vh] overflow-auto"
style={{ maxWidth: '1200px' }}
>
          {selectedJob && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedJob.title}</DialogTitle>
                <div className="text-muted-foreground">{selectedJob.clients?.name}</div>
              </DialogHeader>

              <div className="flex items-center gap-4 mb-6">
                <div>
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Select
                    value={selectedJob.status}
                    onValueChange={(value) => {
                      updateJobStatus(selectedJob.id, value)
                      setSelectedJob({...selectedJob, status: value})
                    }}
                  >
                    <SelectTrigger className="w-[160px] ml-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedJob.price && (
                  <div className="text-lg font-semibold text-emerald-600">${selectedJob.price}</div>
                )}
              </div>

              {selectedJob.description && (
                <div className="mb-8">
                  <div className="text-sm text-muted-foreground mb-2">Description</div>
                  <div className="text-gray-700">{selectedJob.description}</div>
                </div>
              )}

              {/* Photo Management */}
              <div className="border-t pt-8">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <div className="font-semibold text-xl">Photos ({jobPhotos.length})</div>
                    <div className="text-sm text-muted-foreground">Organized documentation</div>
                  </div>

                  <div className="flex gap-3">
                    <Select value={photoFilter} onValueChange={setPhotoFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Categories" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {Array.from(new Set(jobPhotos.map(p => p.category))).map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <label className="cursor-pointer">
                      <Button disabled={uploading}>
                        {uploading ? 'Uploading...' : '📷 Upload Photo'}
                      </Button>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={uploadPhoto}
                        disabled={uploading}
                      />
                    </label>
                  </div>
                </div>

                {jobPhotos.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredPhotos.map((photo) => (
                      <div key={photo.id} className="group relative rounded-2xl overflow-hidden border">
                        <img
                          src={photo.file_url}
                          alt="Job photo"
                          className="w-full h-64 object-cover"
                        />
                        <div className="absolute top-3 left-3">
                          <Badge variant="secondary">{photo.category}</Badge>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => deletePhoto(photo.id, photo.file_url)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-muted-foreground/30 rounded-2xl p-16 text-center">
                    <div className="text-6xl mb-4">📸</div>
                    <div className="text-xl font-medium mb-2">No photos yet</div>
                    <div className="text-muted-foreground">Upload before and after photos</div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
