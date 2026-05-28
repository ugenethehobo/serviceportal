'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Copy, Filter, MessageCircle } from "lucide-react"
import { FileText, Plus, Trash2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { ConfirmDialog, AlertDialog } from "@/components/ui/confirm-dialog"
import {
  formatJobSchedule,
  toDateTimeLocalValue,
  parseDateTimeLocalInTz,
  getDefaultTimezone,
  getJobStartDate,
  getJobEndDate,
  doTimeWindowsOverlap,
  getJobTimeWindow,
  formatTimeOnlyInTz,
  getLocalDateKeyFromInput,
  DEFAULT_JOB_DURATION_MINUTES,
  getTimelinePercent,
  findNextAvailableSlot,
  getNowInTimezone,
} from '@/lib/date-utils'

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const clientId = params.clientId as string

  const [client, setClient] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddJob, setShowAddJob] = useState(false)
  const [showAddBill, setShowAddBill] = useState(false)
  const [selectedJobForBill, setSelectedJobForBill] = useState<any>(null)
  const [selectedJobDetail, setSelectedJobDetail] = useState<any>(null)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleStart, setRescheduleStart] = useState("")
  const [rescheduleEnd, setRescheduleEnd] = useState("")

  // Availability / overlap state for the two scheduling dialogs
  const [dayBookings, setDayBookings] = useState<any[]>([])
  const [availabilityLoading, setAvailabilityLoading] = useState(false)
  const [availabilityDateKey, setAvailabilityDateKey] = useState<string | null>(null) // YYYY-MM-DD wall date in company TZ
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [selectedCategoryPhotos, setSelectedCategoryPhotos] = useState<any[]>([])
  const [selectedCategoryName, setSelectedCategoryName] = useState("")
  const [jobForm, setJobForm] = useState({ title: '', description: '', scheduled_start: '', scheduled_end: '' })
  const [billForm, setBillForm] = useState({ name: '', amount: '', notes: '' })
  const [uploading, setUploading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all')
  const [showFilters, setShowFilters] = useState(false)

  // Shared ConfirmDialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: React.ReactNode
    confirmLabel?: string
    onConfirm: () => void | Promise<void>
    destructive?: boolean
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {}
  })

  // Pending photo for category selection before upload
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [pendingPhotoJobId, setPendingPhotoJobId] = useState<string | null>(null)
  const [photoCategoryInput, setPhotoCategoryInput] = useState("General")

  const [showMessagesModal, setShowMessagesModal] = useState(false)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [messages, setMessages] = useState<any[]>([])
  const [showNotification, setShowNotification] = useState(false)
  const [notificationMessage, setNotificationMessage] = useState("")
  const [jobStatuses, setJobStatuses] = useState<any[]>([])

  // Client editing
  const [showEditClient, setShowEditClient] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' })
  const [showCreateEstimate, setShowCreateEstimate] = useState(false)
  const [editingEstimate, setEditingEstimate] = useState<any>(null)
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [recurringJob, setRecurringJob] = useState<any>(null)
  const [defaultTimezone, setDefaultTimezone] = useState('America/Chicago')
  const [estimateForm, setEstimateForm] = useState({
    title: '',
    description: '',
  })
  const [estimateItems, setEstimateItems] = useState([
    { description: '', amount: '' }
  ])
  const [savingEstimate, setSavingEstimate] = useState(false)
  const [rightPanel, setRightPanel] = useState<'timeline' | 'estimates'>('timeline')
  const [estimates, setEstimates] = useState<any[]>([])
  const [loadingEstimates, setLoadingEstimates] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])
  const [showCreateContract, setShowCreateContract] = useState(false)
  const [newContractTitle, setNewContractTitle] = useState('')
  const [newContractBody, setNewContractBody] = useState('')
  const [selectedJobForContract, setSelectedJobForContract] = useState<string>('')

  const supabase = createClient()

  // showToast is being phased out in favor of ConfirmDialog / AlertDialog for professional modal feedback.
  // Keeping the state for now during transition; new code uses the shared components directly.

  const generateRecurringInstances = (job: any) => {
    if (!job.is_recurring || !job.recurrence_frequency) return [job]

    const instances: any[] = []
    let currentDate = job.scheduled_date ? new Date(job.scheduled_date) : new Date()
    const maxOccurrences = 24
    let count = 0

    // Always include the current (or next) master occurrence
    while (count < maxOccurrences) {
      if (currentDate > new Date()) {
        instances.push({
          ...job,
          id: job.id,
          scheduled_date: currentDate.toISOString(),
          is_recurring_instance: count > 0
        })
      }

      // Advance to next occurrence
      let nextDate = new Date(currentDate)
      switch (job.recurrence_frequency) {
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break
        case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break
        case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break
        case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break
        default: return instances
      }

      if (job.recurrence_end_date && nextDate > new Date(job.recurrence_end_date)) break

      currentDate = nextDate
      count++
    }

    return instances
  }

  // Automatically advance overdue recurring jobs to the next future date
  const advanceOverdueRecurringJobs = async (jobsData: any[]) => {
    const now = new Date()
    for (const job of jobsData) {
      if (!job.is_recurring || !job.scheduled_date) continue

      const scheduled = new Date(job.scheduled_date)
      if (scheduled > now) continue // still in the future → nothing to do

      // Job is overdue → calculate next occurrence
      let nextDate = new Date(scheduled)
      switch (job.recurrence_frequency) {
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break
        case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break
        case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break
        case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break
        default: continue
      }

      if (job.recurrence_end_date && nextDate > new Date(job.recurrence_end_date)) continue

      // Update the master job in the database (sync both columns)
      await supabase
        .from('jobs')
        .update({ scheduled_date: nextDate.toISOString(), scheduled_start: nextDate.toISOString() })
        .eq('id', job.id)
    }
  }

  const loadMessages = async () => {
    const { data: messageData } = await supabase
      .from('messages')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })

    setMessages(messageData || [])

    const unread = messageData?.filter(m => m.is_from_client && !m.read).length || 0
    setUnreadMessageCount(unread)
  }

  /**
   * Fetch other scheduled jobs for the given wall-clock date (in company TZ).
   * Used to power availability display + overlap warnings in Add Job / Reschedule.
   * We query a generous window (±1 day) then do precise client-side overlap filtering.
   */
  const loadDayAvailability = async (localDateKey: string | null, excludeJobId?: string) => {
    if (!localDateKey) {
      setDayBookings([])
      setAvailabilityDateKey(null)
      return
    }

    setAvailabilityLoading(true)
    try {
      const tz = getDefaultTimezone(defaultTimezone)

      // Build a safe query window: the calendar day in company TZ ± 24h buffer
      // We use the date key the user sees in the datetime-local input (already wall date).
      const dayStartLocal = `${localDateKey}T00:00`
      const dayEndLocal = `${localDateKey}T23:59`

      const dayStartISO = parseDateTimeLocalInTz(dayStartLocal, tz)
      const dayEndISO = parseDateTimeLocalInTz(dayEndLocal, tz)

      // Query a bit wider to catch jobs that start the evening before or spill over
      const queryStart = new Date(new Date(dayStartISO).getTime() - 24 * 60 * 60 * 1000).toISOString()
      const queryEnd = new Date(new Date(dayEndISO).getTime() + 24 * 60 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('jobs')
        .select('id, title, status, scheduled_start, scheduled_end, scheduled_date, clients(name)')
        .or('scheduled_start.not.is.null,scheduled_date.not.is.null')
        .gte('scheduled_start', queryStart)
        .lte('scheduled_start', queryEnd)
        .order('scheduled_start', { ascending: true })

      if (error) throw error

      let relevant = (data || []).filter((j: any) => {
        if (excludeJobId && j.id === excludeJobId) return false
        // Only keep jobs that actually have some scheduling data
        return j.scheduled_start || j.scheduled_date
      })

      setDayBookings(relevant)
      setAvailabilityDateKey(localDateKey)
    } catch (e) {
      console.error('Failed to load availability', e)
      setDayBookings([])
    } finally {
      setAvailabilityLoading(false)
    }
  }

  const markMessagesAsRead = async () => {
    const unreadClientMessages = messages.filter(m => m.is_from_client && !m.read)

    if (unreadClientMessages.length === 0) return

    const messageIds = unreadClientMessages.map(m => m.id)

    const { error } = await supabase
      .from('messages')
      .update({ read: true })
      .in('id', messageIds)

    if (!error) {
      await loadMessages()
    }
  }

  const loadEstimates = async () => {
    setLoadingEstimates(true)

    const { data, error } = await supabase
      .from('estimates')
      .select(`
        *,
        estimate_items (*),
        jobs (id, title, status)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (!error) {
      setEstimates(data || [])
    }
    setLoadingEstimates(false)
  }

  const loadContracts = async () => {
    const { data } = await supabase
      .from('contracts')
      .select(`*, contract_signatures(*)`)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    if (data) setContracts(data)
  }

  const openEditClient = () => {
    if (!client) return
    setClientForm({
      name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      notes: client.notes || '',
    })
    setShowEditClient(true)
  }

  const handleUpdateClient = async () => {
    if (!client) return

    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: clientForm.name,
          email: clientForm.email || null,
          phone: clientForm.phone || null,
          address: clientForm.address || null,
          notes: clientForm.notes || null,
        })
        .eq('id', clientId)

      if (error) throw error

      // Refresh
      const { data: updated } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .single()

      if (updated) setClient(updated)

      setShowEditClient(false)
      setConfirmDialog({
        open: true,
        title: "Success",
        description: "Client updated successfully",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    } catch (err: any) {
      setConfirmDialog({
        open: true,
        title: "Update Failed",
        description: 'Failed to update client: ' + (err?.message || err),
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    }
  }

  const openEditEstimate = (estimate: any) => {
    setEstimateForm({
      title: estimate.title || '',
      description: estimate.description || '',
    })

    if (estimate.estimate_items && estimate.estimate_items.length > 0) {
      setEstimateItems(
        estimate.estimate_items.map((item: any) => ({
          description: item.description,
          amount: item.amount.toString(),
        }))
      )
    } else {
      setEstimateItems([{ description: '', amount: '' }])
    }

    setEditingEstimate(estimate)
    setShowCreateEstimate(true)
  }

  const generateAndSaveInvoice = async (job: any) => {
    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default

      const { data: settings } = await supabase
        .from('company_settings')
        .select('*')
        .single()

      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      let y = 20

      // === LOGO ===
      if (settings?.logo_url) {
        try {
          const logoBase64 = await fetch(settings.logo_url)
            .then(res => res.blob())
            .then(blob => new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result as string)
              reader.readAsDataURL(blob)
            }))

          doc.addImage(logoBase64, 'PNG', 20, y, 45, 45)
          y += 55   // Increased spacing to prevent clipping
        } catch (e) {
          console.log("Could not load logo")
        }
      }

      // === COMPANY NAME (under logo) ===
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text(settings?.company_name || 'ServicePortal', 20, y)

      // Company contact info
      y += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      if (settings?.company_address) doc.text(settings.company_address, 20, y)
      y += 5
      if (settings?.company_phone) doc.text(`Phone: ${settings.company_phone}`, 20, y)
      y += 5
      if (settings?.company_email) doc.text(`Email: ${settings.company_email}`, 20, y)

      // === RIGHT SIDE: INVOICE TITLE ===
      doc.setFontSize(28)
      doc.text("INVOICE", pageWidth - 20, 35, { align: "right" })

      doc.setFontSize(10)
      doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth - 20, 48, { align: "right" })
      doc.text(`Invoice #: INV-${job.id.slice(0, 8).toUpperCase()}`, pageWidth - 20, 53, { align: "right" })

      // === BILL TO - REAL CLIENT NAME ===
      y = 102
      doc.setFontSize(11)
      doc.text("Bill To:", 20, y)
      doc.setFontSize(12)
      doc.text(job.clients?.name || "Client", 20, y + 5)
      if (job.clients?.address) doc.text(job.clients.address, 20, y + 10)

      // Job title on right
      doc.text(`Job: ${job.title}`, pageWidth - 20, y, { align: "right" })

      // === BILLS TABLE ===
      const bills = job.bills || []
      const tableData = bills.map((bill: any) => [
        bill.name,
        bill.notes || "",
        `$${Number(bill.amount).toFixed(2)}`,
        bill.status.toUpperCase()
      ])

      autoTable(doc, {
        startY: y + 35,
        head: [["Description", "Notes", "Amount", "Status"]],
        body: tableData.length > 0 ? tableData : [["No charges", "", "", ""]],
        styles: { fontSize: 10 },
        headStyles: {
          fillColor: settings?.primary_color
            ? [parseInt(settings.primary_color.slice(1,3),16), parseInt(settings.primary_color.slice(3,5),16), parseInt(settings.primary_color.slice(5,7),16)]
            : [30, 41, 59]
        },
        columnStyles: { 2: { halign: 'right' } }
      })

      const total = bills.reduce((sum: number, b: any) => sum + Number(b.amount), 0)
      const finalY = (doc as any).lastAutoTable.finalY || 140

      doc.setFontSize(12)
      doc.text("Total Due:", pageWidth - 60, finalY + 15)
      doc.setFontSize(14)
      doc.text(`$${total.toFixed(2)}`, pageWidth - 20, finalY + 15, { align: "right" })

      // Footer
      doc.setFontSize(9)
      doc.text("Thank you for your business!", pageWidth / 2, 280, { align: "center" })

      const pdfBlob = doc.output('blob')
      const fileName = `Invoice-${job.title.replace(/\s+/g, '-')}-${Date.now()}.pdf`

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const filePath = `${job.id}/invoices/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(filePath)

      await supabase.from('files').insert({
        job_id: job.id,
        client_id: job.client_id,
        user_id: user.id,
        file_url: publicUrl,
        category: 'Invoice',
        description: `Invoice for ${job.title}`
      })

      await loadClientData()

      setTimeout(() => {
        const freshJob = jobs.find((j: any) => j.id === job.id)
        if (freshJob) setSelectedJobDetail(freshJob)
      }, 300)

      setConfirmDialog({
        open: true,
        title: "Success",
        description: "Professional invoice generated and saved!",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })

    } catch (error: any) {
      console.error(error)
      setConfirmDialog({
        open: true,
        title: "Invoice Generation Failed",
        description: "Failed to generate invoice: " + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    }
  }



  const handleSetRecurring = async (data: { is_recurring: boolean; frequency?: string; end_date?: string }) => {
    if (!recurringJob) return

    try {
      let newScheduledDate = recurringJob.scheduled_date

      // If turning on recurring OR changing frequency, calculate the next future date
      if (data.is_recurring && data.frequency) {
        let baseDate = recurringJob.scheduled_date
          ? new Date(recurringJob.scheduled_date)
          : new Date()

        // If the current date is already in the past, start from today
        if (baseDate < new Date()) baseDate = new Date()

        let nextDate = new Date(baseDate)

        switch (data.frequency) {
          case 'weekly':  nextDate.setDate(nextDate.getDate() + 7); break
          case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break
          case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break
          case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break
          case 'yearly':  nextDate.setFullYear(nextDate.getFullYear() + 1); break
        }

        // Respect end date if set
        if (data.end_date && nextDate > new Date(data.end_date)) {
          nextDate = new Date(data.end_date)
        }

        newScheduledDate = nextDate.toISOString()
      }

      const { error } = await supabase
        .from('jobs')
        .update({
          is_recurring: data.is_recurring,
          recurrence_frequency: data.frequency || null,
          recurrence_end_date: data.end_date || null,
          scheduled_date: newScheduledDate,
          scheduled_start: newScheduledDate,
        })
        .eq('id', recurringJob.id)

      if (error) throw error

      await loadClientData()

      // Refresh the open modal with the new date
      setTimeout(() => {
        const freshJob = jobs.find((j: any) => j.id === recurringJob.id)
        if (freshJob) setSelectedJobDetail(freshJob)
      }, 100)

      setShowRecurringModal(false)
      setRecurringJob(null)
      setConfirmDialog({
        open: true,
        title: "Success",
        description: data.is_recurring ? "Recurring settings updated!" : "Recurring disabled",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    } catch (error: any) {
      setConfirmDialog({
        open: true,
        title: "Update Failed",
        description: "Failed to update recurring settings: " + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    }
  }

  // Helper to turn raw job + files into the shape the UI expects (with .photos and .documents arrays)
  const processJobFiles = (job: any) => {
    if (!job) return job
    const allFiles = job.files || []
    return {
      ...job,
      photos: allFiles.filter((f: any) => {
        return f.file_type === 'photo' ||
               f.file_type === 'image' ||
               (f.category && f.category.toLowerCase().includes('photo'))
      }),
      documents: allFiles.filter((f: any) => {
        return f.file_type === 'document' ||
               f.category === 'Invoice' ||
               f.category === 'Contract' ||
               (f.description && f.description.startsWith('Invoice for')) ||
               (f.description && f.description.includes('Contract'))
      })
    }
  }

  const loadClientData = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    const { data: jobsData } = await supabase
      .from('jobs')
      .select(`
        *,
        bills (*),
        files (*),
        clients (name, address)   // ← This was missing
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

      await advanceOverdueRecurringJobs(jobsData || [])

    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('job_statuses, default_timezone')
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single()

    setDefaultTimezone(getDefaultTimezone(companySettings?.default_timezone))

    if (companySettings?.job_statuses && Array.isArray(companySettings.job_statuses)) {
      setJobStatuses(companySettings.job_statuses)
    } else {
      setJobStatuses([
        { key: "quote_sent", label: "Quote Sent", color: "#eab308" },
        { key: "scheduled", label: "Scheduled", color: "#3b82f6" },
        { key: "in_progress", label: "In Progress", color: "#8b5cf6" },
        { key: "completed", label: "Completed", color: "#22c55e" },
        { key: "invoiced", label: "Invoiced", color: "#f97316" },
        { key: "paid", label: "Paid", color: "#10b981" },
      ])
    }

    // Base jobs only (no expansion for main grid)
    const jobsWithPhotosAndDocs = (jobsData || []).map(processJobFiles) || []

    setClient(clientData)
    setJobs(jobsWithPhotosAndDocs)
    await loadContracts()
    setLoading(false)
  }

  const formatScheduledDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    // Use the rich formatter (handles start/end if the caller passes full job shape; here we only have string so show start)
    return formatJobSchedule({ scheduled_start: dateStr, scheduled_date: dateStr }, getDefaultTimezone(defaultTimezone))
  }

  useEffect(() => {
    if (clientId) {
      loadClientData()
      loadMessages()
    }
  }, [clientId])

  useEffect(() => {
    if (showMessagesModal) {
      markMessagesAsRead()
    }
  }, [showMessagesModal])

  // --- Availability / overlap watchers (Add Job) ---
  useEffect(() => {
    if (!showAddJob) {
      setDayBookings([])
      setAvailabilityDateKey(null)
      return
    }
    const key = getLocalDateKeyFromInput(jobForm.scheduled_start, getDefaultTimezone(defaultTimezone)) 
      || getLocalDateKeyFromInput(new Date().toISOString(), getDefaultTimezone(defaultTimezone))
    if (key && key !== availabilityDateKey) {
      loadDayAvailability(key)
    }
  }, [showAddJob, jobForm.scheduled_start, defaultTimezone])

  // --- Availability / overlap watchers (Reschedule) ---
  useEffect(() => {
    if (!showRescheduleModal || !selectedJobDetail) {
      // keep previous data until next open; or clear if desired
      return
    }
    const key = getLocalDateKeyFromInput(rescheduleStart, getDefaultTimezone(defaultTimezone))
    if (key && key !== availabilityDateKey) {
      loadDayAvailability(key, selectedJobDetail.id)
    }
  }, [showRescheduleModal, rescheduleStart, selectedJobDetail?.id, defaultTimezone])

  // Professional visual daily availability timeline (inspired by ServiceTitan/Jobber/Housecall Pro dispatch boards).
  // Shows a clean horizontal timeline bar with booked blocks + live proposed slot overlay.
  // Sharp styling, glanceable, no excessive rounding.
  const renderAvailabilityPanel = (opts: {
    dayBookings: any[]
    loading: boolean
    dateKey: string | null
    proposedStart: string
    proposedEnd: string
    tz: string
    excludeJobId: string | null
    // Optional callbacks so "Find next available" can auto-fill the inputs in the parent modals
    onSelectTime?: (startLocal: string, endLocal: string) => void
  }) => {
    const { dayBookings, loading, dateKey, proposedStart, proposedEnd, tz, onSelectTime } = opts

    const proposalStartISO = proposedStart ? parseDateTimeLocalInTz(proposedStart, tz) : null
    const proposalEndISO = proposedEnd ? parseDateTimeLocalInTz(proposedEnd, tz) : null

    let hasOverlap = false
    const overlappingTitles: string[] = []

    for (const b of dayBookings) {
      const win = getJobTimeWindow(b)
      if (!win.start) continue
      const overlaps = doTimeWindowsOverlap(
        proposalStartISO,
        proposalEndISO || (proposalStartISO ? new Date(new Date(proposalStartISO).getTime() + DEFAULT_JOB_DURATION_MINUTES * 60_000) : null),
        win.start,
        win.end
      )
      if (overlaps) {
        hasOverlap = true
        overlappingTitles.push(`${formatTimeOnlyInTz(win.start, tz)} ${b.title}`)
      }
    }

    // Determine if the day we're showing availability for is "today" in the company timezone.
    // This controls clamping of the timeline and "find next available" behavior.
    const nowInCompanyTz = getNowInTimezone(tz);
    const nowDateKey = `${nowInCompanyTz.getFullYear()}-${String(nowInCompanyTz.getMonth()+1).padStart(2,'0')}-${String(nowInCompanyTz.getDate()).padStart(2,'0')}`;
    const isToday = !!dateKey && dateKey === nowDateKey;

    const nowForClamping = isToday ? nowInCompanyTz : null;

    // Build visual blocks for the timeline.
    // When it's today, we clamp past jobs so they don't appear as "available" on the left side of the bar.
    const bookedBlocks = dayBookings.map((b) => {
      const win = getJobTimeWindow(b)
      if (!win.start || !win.end) return null

      const left = getTimelinePercent(win.start, tz, nowForClamping)
      const right = getTimelinePercent(win.end, tz, nowForClamping)
      const width = Math.max(1.5, right - left)

      const color = getStatusColor(b.status)
      return { left, width, title: b.title, color, status: b.status }
    }).filter(Boolean)

    const proposedLeft = proposalStartISO
      ? getTimelinePercent(new Date(proposalStartISO), tz, nowForClamping)
      : 0;

    const proposedWidth = proposalStartISO && proposalEndISO
      ? Math.max(2, getTimelinePercent(new Date(proposalEndISO), tz, nowForClamping) - proposedLeft)
      : 8;

    // Only pass the current time as the minimum when scheduling for today
    const minStartForToday = isToday ? nowInCompanyTz : null;

    const nextSlot = !loading
      ? findNextAvailableSlot(dayBookings, tz, DEFAULT_JOB_DURATION_MINUTES, undefined, undefined, minStartForToday)
      : null;

    return (
      <div className="mt-3 border-t pt-4 text-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium text-sm text-foreground flex items-center gap-2">
            {dateKey ? `Availability on ${dateKey}` : 'Availability'}
          </div>
          {loading && <span className="text-muted-foreground text-xs">Checking schedule…</span>}
        </div>

        {/* Visual daily timeline — significantly taller + sharp for clarity and better styling match */}
        <div className="relative h-14 bg-muted border mb-2 overflow-hidden">
          {/* Booked blocks — colored by job status for instant recognition (sharp, no rounding) */}
          {bookedBlocks.map((block, i) => (
            <div
              key={i}
              className="absolute top-1 bottom-1 border-l-2"
              style={{ 
                left: `${block.left}%`, 
                width: `${block.width}%`,
                backgroundColor: block.color + '99',
                borderLeftColor: block.color 
              }}
              title={`${block.title} (${block.status})`}
            />
          ))}

          {/* "Now" marker — only shown when viewing availability for today */}
          {isToday && (
            <div
              className="absolute top-0 bottom-0 w-px bg-primary z-10"
              style={{ left: `${getTimelinePercent(nowInCompanyTz, tz)}%` }}
              title="Current time"
            />
          )}

          {/* Proposed slot overlay — prominent, color coded for free vs conflict */}
          {proposedStart && (
            <div
              className={`absolute top-0.5 bottom-0.5 border-2 ${hasOverlap ? 'bg-destructive/70 border-destructive' : 'bg-primary/60 border-primary'}`}
              style={{ left: `${Math.max(0, Math.min(96, proposedLeft))}%`, width: `${Math.min(100 - proposedLeft, proposedWidth)}%` }}
              title={hasOverlap ? 'Overlaps existing job' : 'Your proposed time slot'}
            />
          )}

          {/* Subtle vertical hour markers (sharp) */}
          {[25, 50, 75].map((p) => (
            <div key={p} className="absolute top-0 bottom-0 w-px bg-border" style={{ left: `${p}%` }} />
          ))}
        </div>

        {/* Time scale labels — now below the bar for better readability (larger, clear) */}
        <div className="flex justify-between text-[10px] text-muted-foreground px-0.5 -mt-0.5 mb-2 font-mono tracking-tight">
          <div>7:00</div>
          <div>12:00</div>
          <div>19:00</div>
        </div>

        {/* Status row + Find next action */}
        <div className="flex items-center justify-between text-[11px] mb-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            {!loading && dayBookings.length === 0 && <span className="text-emerald-600 font-medium">Fully available</span>}
            {!loading && dayBookings.length > 0 && <span>{dayBookings.length} job{dayBookings.length > 1 ? 's' : ''} scheduled</span>}
            {hasOverlap && <span className="text-destructive font-medium">⚠ Overlaps existing booking</span>}
          </div>

          {nextSlot && onSelectTime && (
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={() => onSelectTime(nextSlot.startLocal, nextSlot.endLocal)}
            >
              Find next available →
            </button>
          )}
        </div>

        {/* Job list — now much clearer and scannable (status-colored, better hierarchy, less cramped) */}
        {!loading && dayBookings.length > 0 && (
          <div className="space-y-2 max-h-[120px] overflow-auto pr-1 border-t pt-3 text-[12px]">
            {dayBookings.slice(0, 7).map((b, idx) => {
              const win = getJobTimeWindow(b)
              const color = getStatusColor(b.status)
              const statusLabel = jobStatuses.find((s: any) => s.key === b.status)?.label || b.status.replace('_', ' ')
              const endTime = win.end ? formatTimeOnlyInTz(win.end, tz) : null

              return (
                <div 
                  key={b.id || idx} 
                  className="flex items-start gap-3 border-l-4 pl-3 py-1"
                  style={{ borderLeftColor: color }}
                >
                  <div className="font-mono text-[10px] text-muted-foreground tabular-nums shrink-0 pt-0.5 min-w-[92px]">
                    {formatTimeOnlyInTz(win.start, tz)}
                    {endTime && ` – ${endTime}`}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground truncate leading-tight">{b.title}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                      <span style={{ color }}>{statusLabel}</span>
                      {b.clients?.name && <span className="truncate opacity-70">· {b.clients.name}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
            {dayBookings.length > 7 && (
              <div className="text-[10px] text-muted-foreground pl-3">+{dayBookings.length - 7} more jobs</div>
            )}
          </div>
        )}

        {hasOverlap && overlappingTitles.length > 0 && (
          <div className="mt-2 text-[10px] text-destructive font-medium">
            ⚠ Conflicts with: {overlappingTitles.slice(0, 2).join(', ')}{overlappingTitles.length > 2 && ` +${overlappingTitles.length - 2}`}
          </div>
        )}
      </div>
    )
  }

  const handleAddJob = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const tz = getDefaultTimezone(defaultTimezone)
    const startISO = jobForm.scheduled_start ? parseDateTimeLocalInTz(jobForm.scheduled_start, tz) : null
    const endISO = jobForm.scheduled_end ? parseDateTimeLocalInTz(jobForm.scheduled_end, tz) : null

    const { error } = await supabase.from('jobs').insert([{
      client_id: clientId,
      user_id: user.id,
      title: jobForm.title,
      description: jobForm.description || null,
      scheduled_start: startISO,
      scheduled_end: endISO,
      scheduled_date: startISO, // compat
      status: 'quote_sent'
    }])

    if (!error) {
      setJobForm({ title: '', description: '', scheduled_start: '', scheduled_end: '' })
      setShowAddJob(false)
      setDayBookings([])
      setAvailabilityDateKey(null)
      loadClientData()
    }
  }

  const handleCreateEstimate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!estimateForm.title.trim()) {
      setConfirmDialog({
        open: true,
        title: "Validation Error",
        description: "Please enter a title for the estimate",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
      return
    }

    const validItems = estimateItems.filter(
      item => item.description.trim() !== '' && item.amount !== ''
    )

    if (validItems.length === 0) {
      setConfirmDialog({
        open: true,
        title: "Validation Error",
        description: "Please add at least one line item",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
      return
    }

    setSavingEstimate(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const subtotal = validItems.reduce((sum, item) => sum + parseFloat(item.amount), 0)

      if (editingEstimate) {
        const updateData: any = {
          title: estimateForm.title,
          description: estimateForm.description || null,
          subtotal: subtotal,
          total: subtotal,
          updated_at: new Date().toISOString(),
        }

        if (editingEstimate.status === 'disputed') {
          updateData.status = 'pending'
          updateData.dispute_reason = null
        }

        const { error: updateError } = await supabase
          .from('estimates')
          .update(updateData)
          .eq('id', editingEstimate.id)

        if (updateError) throw updateError

        await supabase.from('estimate_items').delete().eq('estimate_id', editingEstimate.id)

        const itemsToInsert = validItems.map(item => ({
          estimate_id: editingEstimate.id,
          description: item.description,
          amount: parseFloat(item.amount),
        }))

        const { error: itemsError } = await supabase.from('estimate_items').insert(itemsToInsert)
        if (itemsError) throw itemsError

        setConfirmDialog({
          open: true,
          title: "Success",
          description: "Estimate updated successfully!",
          confirmLabel: "OK",
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
        })

      } else {
        const { data: estimate, error: estimateError } = await supabase
          .from('estimates')
          .insert({
            client_id: clientId,
            user_id: user.id,
            title: estimateForm.title,
            description: estimateForm.description || null,
            status: 'pending',
            subtotal: subtotal,
            total: subtotal,
          })
          .select()
          .single()

        if (estimateError) throw estimateError

        const itemsToInsert = validItems.map(item => ({
          estimate_id: estimate.id,
          description: item.description,
          amount: parseFloat(item.amount),
        }))

        const { error: itemsError } = await supabase.from('estimate_items').insert(itemsToInsert)
        if (itemsError) throw itemsError

        setConfirmDialog({
          open: true,
          title: "Success",
          description: "Estimate created successfully!",
          confirmLabel: "OK",
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
        })
      }

      setEstimateForm({ title: '', description: '' })
      setEstimateItems([{ description: '', amount: '' }])
      setEditingEstimate(null)
      setShowCreateEstimate(false)

      if (rightPanel === 'estimates') {
        loadEstimates()
      }

    } catch (error: any) {
        setConfirmDialog({
          open: true,
          title: "Save Failed",
          description: "Failed to save estimate: " + error.message,
          confirmLabel: "OK",
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
        })
    } finally {
      setSavingEstimate(false)
    }
  }

  const handleAddBill = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedJobForBill) return

    const { error } = await supabase.from('bills').insert([{
      job_id: selectedJobForBill.id,
      name: billForm.name,
      amount: parseFloat(billForm.amount),
      notes: billForm.notes || null,
      status: 'pending'
    }])

    if (!error) {
      setBillForm({ name: '', amount: '', notes: '' })
      setShowAddBill(false)
      setSelectedJobForBill(null)
      loadClientData()
    }
  }

  const handleMarkBillPaid = async (billId: string, billName: string, jobTitle: string) => {
    setConfirmDialog({
      open: true,
      title: "Mark as Paid?",
      description: `Record "${billName}" (for ${jobTitle}) as paid via cash, check, or other offline method? This cannot be undone.`,
      confirmLabel: "Mark Paid",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        const { error } = await supabase
          .from('bills')
          .update({ status: 'paid' })
          .eq('id', billId)

        if (!error) {
          loadClientData()
          // Also refresh the open job detail if present
          if (selectedJobDetail) {
            const fresh = await supabase.from('jobs').select(`*, bills (*), files (*)`).eq('id', selectedJobDetail.id).single()
            if (fresh.data) setSelectedJobDetail(fresh.data)
          }
        } else {
          setConfirmDialog({
            open: true,
            title: "Error",
            description: "Failed to update bill status.",
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog({ open: false })
          })
        }
      }
    })
  }

  const handleDeleteJob = async (jobId: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Job?",
      description: "This will permanently delete the job and all associated bills and photos. This action cannot be undone.",
      confirmLabel: "Delete Job",
      destructive: true,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          await supabase.from('bills').delete().eq('job_id', jobId)
          await supabase.from('files').delete().eq('job_id', jobId)

          const { error } = await supabase.from('jobs').delete().eq('id', jobId)
          if (error) throw error

          loadClientData()
          setSelectedJobDetail(null)
          // Use custom toast pattern instead of alert in future polishing
        } catch (error: any) {
          setConfirmDialog({
            open: true,
            title: "Delete Failed",
            description: "Failed to delete job: " + error.message,
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
          })
        }
      }
    })
  }

  // Professional photo upload for admin (was previously broken / missing function)
  const uploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>, jobId: string) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setConfirmDialog({
          open: true,
          title: "Authentication Required",
          description: "You must be logged in to upload photos",
          confirmLabel: "OK",
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
        })
        setUploading(false)
        return
      }

      // Default category — will be enhanced with a proper category selector modal in future polishing
      const category = "General"

      const fileName = `${jobId}/photos/${Date.now()}-${file.name.replace(/\s+/g, '_')}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        setConfirmDialog({
          open: true,
          title: "Upload Failed",
          description: 'Upload failed: ' + uploadError.message,
          confirmLabel: "OK",
          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
        })
        setUploading(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(fileName)

      await supabase.from('files').insert([{
        job_id: jobId,
        client_id: clientId,
        user_id: user.id,
        file_url: publicUrl,
        file_type: 'photo',
        category: category,
        description: file.name
      }])

      await loadClientData()
      // Refresh the currently open job detail if applicable
      if (selectedJobDetail && selectedJobDetail.id === jobId) {
        // The loadClientData already updates jobs; we can re-select
        const freshJob = (await supabase.from('jobs').select(`*, bills (*), files (*)`).eq('id', jobId).single()).data
        if (freshJob) {
          setSelectedJobDetail(freshJob)
        }
      }

    } catch (err: any) {
      setConfirmDialog({
        open: true,
        title: "Upload Error",
        description: 'Upload failed: ' + err.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
    }
    setUploading(false)
  }

  // Called after user selects category for a pending photo
  const confirmPhotoUploadWithCategory = async () => {
    if (!pendingPhotoFile || !pendingPhotoJobId) return

    const file = pendingPhotoFile
    const jobId = pendingPhotoJobId
    const category = photoCategoryInput.trim() || "General"

    // Clear pending state
    setPendingPhotoFile(null)
    setPendingPhotoJobId(null)
    setPhotoCategoryInput("General")

    // Reuse the upload logic by faking the event or duplicating minimal code
    setUploading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setConfirmDialog({ open: true, title: "Error", description: "You must be logged in", confirmLabel: "OK", onConfirm: () => setConfirmDialog(p => ({...p, open:false})) })
        setUploading(false)
        return
      }

      const fileName = `${jobId}/photos/${Date.now()}-${file.name.replace(/\s+/g, '_')}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(fileName, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        setConfirmDialog({ open: true, title: "Upload Failed", description: 'Upload failed: ' + uploadError.message, confirmLabel: "OK", onConfirm: () => setConfirmDialog(p => ({...p, open:false})) })
        setUploading(false)
        return
      }

      const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(fileName)

      await supabase.from('files').insert([{
        job_id: jobId,
        client_id: clientId,
        user_id: user.id,
        file_url: publicUrl,
        file_type: 'photo',
        category: category,
        description: file.name
      }])

      await loadClientData()

      // Refresh the open job detail with properly processed photos/documents
      if (selectedJobDetail && selectedJobDetail.id === jobId) {
        const { data: rawFreshJob } = await supabase
          .from('jobs')
          .select(`*, bills (*), files (*)`)
          .eq('id', jobId)
          .single()

        if (rawFreshJob) {
          const processed = processJobFiles(rawFreshJob)
          setSelectedJobDetail(processed)
        }
      }

    } catch (err: any) {
      setConfirmDialog({ open: true, title: "Upload Error", description: 'Upload failed: ' + err.message, confirmLabel: "OK", onConfirm: () => setConfirmDialog(p => ({...p, open:false})) })
    }
    setUploading(false)
  }

  const handleDeleteEstimate = async (estimateId: string) => {
    setConfirmDialog({
      open: true,
      title: "Delete Estimate?",
      description: "Are you sure you want to delete this estimate?",
      confirmLabel: "Delete Estimate",
      destructive: true,
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          await supabase.from('estimate_items').delete().eq('estimate_id', estimateId)
          const { error } = await supabase.from('estimates').delete().eq('id', estimateId)
          if (error) throw error

          loadClientData()
          setSelectedJobDetail(null)
          setConfirmDialog({
            open: true,
            title: "Success",
            description: "Estimate deleted successfully.",
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
          })
        } catch (error: any) {
          setConfirmDialog({
            open: true,
            title: "Delete Failed",
            description: "Failed to delete estimate: " + error.message,
            confirmLabel: "OK",
            onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
          })
        }
      }
    })

    // Confirmation and execution now handled via the shared ConfirmDialog above.
  }

  const getLightStatusColor = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)

    if (found?.color) {
      return {
        backgroundColor: `${found.color}15`,
        borderColor: `${found.color}60`,
      }
    }

    const colors: Record<string, string> = {
      quote_sent: 'bg-yellow-200/20 border-yellow-300/80',
      scheduled: 'bg-blue-200/20 border-blue-300/80',
      in_progress: 'bg-purple-200/20 border-purple-300/80',
      completed: 'bg-green-200/20 border-green-300/80',
      invoiced: 'bg-orange-200/20 border-orange-300/80',
      paid: 'bg-emerald-200/20 border-emerald-300/80'
    }

    return { className: colors[status] || 'bg-gray-200/40 border-gray-300/60' }
  }

  const getStatusColor = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)
    return found?.color || '#64748b'
  }

  if (loading) {
    return <div className="p-8">Loading client...</div>
  }

  if (!client) {
    return <div className="p-8">Client not found</div>
  }

  // Timeline uses expanded recurring instances
  const timelineJobs = jobs.flatMap((job: any) => {
    const instances = generateRecurringInstances(job)
    return instances.map((instance, idx) => ({
      ...instance,
      _timelineKey: instance.is_recurring_instance
        ? `${job.id}-rec-${idx}`
        : job.id
    }))
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Notification Toast */}
      {showNotification && (
        <div className="fixed top-4 right-4 z-[300] bg-black text-white px-6 py-3 xl shadow-lg flex items-center gap-3">
          <div className="text-green-400">🔔</div>
          <div>{notificationMessage}</div>
        </div>
      )}

      {/* Header with Stats */}
      <div className="flex items-start justify-between gap-6 mb-10 border-b pb-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => router.push('/dashboard/clients')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold tracking-tight">{client.name}</h1>
                <Button variant="outline" size="sm" onClick={openEditClient}>
                  Edit
                </Button>
              </div>
              <p className="text-lg text-muted-foreground">{client.address}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-5 px-6 py-2 bg-muted/30 2xl mx-auto">
          <div className="text-center px-3">
            <div className="text-2xl font-bold">{jobs.length}</div>
            <div className="text-xs text-muted-foreground -mt-1">Total Jobs</div>
          </div>
          <div className="text-center px-3">
            <div className="text-2xl font-bold text-emerald-600">
              ${jobs.reduce((sum, job) => sum + (job.bills?.filter((b: any) => b.status === 'pending').reduce((s: number, b: any) => s + Number(b.amount), 0) || 0), 0)}
            </div>
            <div className="text-xs text-muted-foreground -mt-1">Outstanding</div>
          </div>
          <div className="text-center px-3">
            <div className="text-2xl font-bold">
              {jobs.filter(j => ['scheduled', 'in_progress', 'quote_sent'].includes(j.status)).length}
            </div>
            <div className="text-xs text-muted-foreground -mt-1">Active Jobs</div>
          </div>
          <div className="text-center px-3">
            <div className="text-2xl font-bold">
              {client.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}
            </div>
            <div className="text-xs text-muted-foreground -mt-1">Client Since</div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <Button
            variant="outline"
            onClick={async () => {
              const token = crypto.randomUUID()
              const expiresAt = new Date()
              expiresAt.setDate(expiresAt.getDate() + 90)

              const { error } = await supabase.from('portal_tokens').insert({
                token: token,
                client_id: clientId,
                expires_at: expiresAt.toISOString()
              })

              if (error) {
                setConfirmDialog({
        open: true,
        title: "Error",
        description: "Failed to generate portal link: " + error.message,
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
      })
                return
              }

              const link = `${window.location.origin}/portal/${token}`
              navigator.clipboard.writeText(link)
              setConfirmDialog({
                open: true,
                title: "Copied",
                description: "Secure portal link copied to clipboard!",
                confirmLabel: "OK",
                onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
              })
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy Portal Link
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT: Jobs Grid - ONLY ORIGINAL JOBS (one card per job) */}
        <div className="lg:col-span-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <div className="font-semibold text-3xl">Jobs, Bills & Photos</div>
              <div className="text-sm text-muted-foreground">All projects for this client</div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMessagesModal(true)}
                className="relative"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                Messages
                {unreadMessageCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadMessageCount}
                  </div>
                )}
              </Button>

              <Button
                variant={showFilters ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateEstimate(true)}
              >
                <FileText className="mr-2 h-4 w-4" />
                Create Estimate
              </Button>

              <Button size="sm" onClick={() => setShowAddJob(true)}>
                + Add Job
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 mb-6 pb-4 border-b">
              <Button
                variant={statusFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setStatusFilter('all')}
              >
                All
              </Button>

              {jobStatuses.length > 0 ? (
                jobStatuses.map((statusOption: any) => (
                  <Button
                    key={statusOption.key}
                    variant={statusFilter === statusOption.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setStatusFilter(statusOption.key)}
                    style={
                      statusFilter !== statusOption.key
                        ? {
                            color: statusOption.color,
                            borderColor: statusOption.color,
                          }
                        : {}
                    }
                    className={statusFilter === statusOption.key ? '' : 'hover:bg-muted/50'}
                  >
                    {statusOption.label}
                  </Button>
                ))
              ) : (
                <>
                  <Button variant={statusFilter === 'quote_sent' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('quote_sent')}>Quote Sent</Button>
                  <Button variant={statusFilter === 'scheduled' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('scheduled')}>Scheduled</Button>
                  <Button variant={statusFilter === 'in_progress' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('in_progress')}>In Progress</Button>
                  <Button variant={statusFilter === 'completed' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('completed')}>Completed</Button>
                  <Button variant={statusFilter === 'invoiced' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('invoiced')}>Invoiced</Button>
                  <Button variant={statusFilter === 'paid' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('paid')}>Paid</Button>
                </>
              )}
            </div>
          )}

          {jobs.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {jobs
              .filter(job => statusFilter === 'all' || job.status === statusFilter)
              .map((job) => {
                const safePhotos = job.photos || []
                const safeBills = job.bills || []
                const totalDue = safeBills
                  .filter((b: any) => b.status === 'pending')
                  .reduce((sum: number, b: any) => sum + Number(b.amount), 0) || 0

                return (
                  <Card
                    key={job.id}
                    className="overflow-hidden border-2 hover:border-primary/50 transition-all cursor-pointer py-4"
                    style={
                      typeof getLightStatusColor(job.status) === 'object' && !getLightStatusColor(job.status).className
                        ? getLightStatusColor(job.status)
                        : {}
                    }
                    onClick={() => setSelectedJobDetail(job)}
                  >
                    <CardHeader className="px-6 space-y-3">   {/* ← exactly what you liked */}
                      {/* Title + Scheduled Date (stacked) */}
                      <div>
                        <CardTitle className="text-xl">{job.title}</CardTitle>
                        {job.scheduled_date && (
                          <div className="text-sm text-muted-foreground mt-1">
                            Scheduled: {formatScheduledDate(job.scheduled_date)}
                          </div>
                        )}
                      </div>

                      {/* Stats pill */}
                      <div className="px-2">
                        <div className="flex items-center justify-between bg-muted/30 px-6 py-3 2xl w-full">
                          <div className="text-center flex-1">
                            <div className="text-xl font-semibold">{safeBills.length}</div>
                            <div className="text-xs text-muted-foreground -mt-1">Bills</div>
                          </div>
                          <div className="text-center flex-1">
                            <div className="text-xl font-semibold text-emerald-600">${totalDue}</div>
                            <div className="text-xs text-muted-foreground -mt-1">Due</div>
                          </div>
                          <div className="text-center flex-1">
                            <div className="text-xl font-semibold">{safePhotos.length}</div>
                            <div className="text-xs text-muted-foreground -mt-1">Photos</div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {/* Recurring tag — tight at bottom */}
                    {job.is_recurring && (
                      <div className="px-6 py-1 border-t text-center text-sm text-muted-foreground">
                        Recurring {job.recurrence_frequency
                          ? job.recurrence_frequency.charAt(0).toUpperCase() + job.recurrence_frequency.slice(1)
                          : 'Job'}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                No jobs yet for this client
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT PANEL: Timeline / Estimates / Contracts */}
        <div className="lg:col-span-4">
          <div className="sticky top-8">
            {/* Tabs */}
            <div className="flex border-b mb-4">
              <button
                onClick={() => setRightPanel('timeline')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  rightPanel === 'timeline' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Timeline
              </button>
              <button
                onClick={() => {
                  setRightPanel('estimates')
                  if (estimates.length === 0) loadEstimates()
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  rightPanel === 'estimates' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Estimates
              </button>
              <button
                onClick={() => {
                  setRightPanel('contracts')
                  if (contracts.length === 0) loadContracts()
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  rightPanel === 'contracts' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Contracts
              </button>
            </div>

            {/* Content - only one panel renders at a time */}
            {rightPanel === 'timeline' ? (
              /* TIMELINE CONTENT - unchanged */
              <>
                <div className="mb-6">
                  <div className="font-semibold text-3xl">Timeline</div>
                  <div className="text-sm text-muted-foreground">Scheduled jobs in order</div>
                </div>
                {timelineJobs.filter(j => j.scheduled_date).length > 0 ? (
                  <div className="space-y-4">
                    {timelineJobs
                      .filter(j => j.scheduled_date)
                      .sort((a, b) => new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime())
                      .map((job) => (
                        <Card
                          key={job._timelineKey}
                          className="cursor-pointer hover:border-primary transition-all"
                          onClick={() => setSelectedJobDetail(job)}
                        >
                          <CardContent className="pt-5 pb-5">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold text-lg">{job.title}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {formatJobSchedule(job, getDefaultTimezone(defaultTimezone))}
                                </div>
                              </div>
                              <Badge>
                                {jobStatuses.find((s: any) => s.key === job.status)?.label || job.status.replace('_', ' ')}
                              </Badge>
                            </div>
                            {job.is_recurring && (
                              <div className="mt-6 pt-3 border-t text-center text-sm text-muted-foreground">
                                Recurring {job.recurrence_frequency
                                  ? job.recurrence_frequency.charAt(0).toUpperCase() + job.recurrence_frequency.slice(1)
                                  : 'Job'}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                      <div className="text-6xl mb-4">📅</div>
                      <div className="text-xl font-medium mb-2">No scheduled jobs yet</div>
                      <div className="text-sm">Jobs with scheduled dates will appear here</div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : rightPanel === 'estimates' ? (
              /* ESTIMATES CONTENT - unchanged */
              <>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-3xl">Estimates</div>
                    <div className="text-sm text-muted-foreground">Quotes created for this client</div>
                  </div>
                  <Button size="sm" onClick={() => setShowCreateEstimate(true)}>
                    + New
                  </Button>
                </div>
                {loadingEstimates ? (
                  <div className="text-center py-8 text-muted-foreground">Loading estimates...</div>
                ) : estimates.length > 0 ? (
                  <div className="space-y-3">
                    {estimates.map((estimate) => {
                      const items = estimate.estimate_items || []
                      const total = estimate.total || 0
                      const relatedJob = estimate.jobs?.[0]
                      const isDisputed = estimate.status === 'disputed'
                      const isApproved = estimate.status === 'approved'
                      const getEstimateCardColor = (status: string) => {
                        if (status === 'disputed') return 'bg-red-200/10 border border-red-500/80'
                        if (status === 'approved') return 'bg-emerald-200/10 border border-emerald-500/80'
                        return ''
                      }
                      return (
                        <Card
                          key={estimate.id}
                          className={`cursor-pointer hover:border-primary transition-all ${getEstimateCardColor(estimate.status)}`}
                          onClick={() => {
                            if (estimate.status === 'approved' && estimate.jobs?.[0]) {
                              const relatedJob = estimate.jobs[0]
                              const jobToOpen = jobs.find(j => j.id === relatedJob.id)
                              if (jobToOpen) setSelectedJobDetail(jobToOpen)
                            } else {
                              openEditEstimate(estimate)
                            }
                          }}
                        >
                          <CardContent className="pt-4 pb-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-semibold flex items-center gap-2">
                                  {estimate.title}
                                  {estimate.status === 'disputed' && (
                                    <Badge variant="destructive" className="text-xs">Disputed</Badge>
                                  )}
                                </div>
                                <div className="text-sm text-muted-foreground mt-0.5">
                                  {estimate.estimate_items?.length || 0} item{estimate.estimate_items?.length !== 1 ? 's' : ''} • {new Date(estimate.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-lg">${estimate.total || 0}</div>
                                <Badge variant="outline" className="text-xs capitalize mt-1">
                                  {estimate.status}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex justify-between items-center mt-4 pt-3 border-t">
                              {estimate.status === 'approved' && estimate.jobs?.[0] ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const relatedJob = estimate.jobs[0]
                                    const jobToOpen = jobs.find(j => j.id === relatedJob.id)
                                    if (jobToOpen) setSelectedJobDetail(jobToOpen)
                                  }}
                                >
                                  View Job
                                </Button>
                              ) : (
                                <div />
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteEstimate(estimate.id)
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                      <div className="text-6xl mb-4">📄</div>
                      <div className="text-xl font-medium mb-2">No estimates yet</div>
                      <Button variant="outline" onClick={() => setShowCreateEstimate(true)}>
                        Create your first estimate
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : rightPanel === 'contracts' && (
              /* CONTRACTS CONTENT - clean and separate */
              <>
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-3xl">Contracts</div>
                    <div className="text-sm text-muted-foreground">Digital contracts for this client</div>
                  </div>
                  <Button size="sm" onClick={() => setShowCreateContract(true)}>
                    + New Contract
                  </Button>
                </div>

                {contracts.length > 0 ? (
                  <div className="space-y-3">
                    {contracts.map((contract) => {
                      const isSigned = contract.contract_signatures && contract.contract_signatures.length > 0
                      return (
                        <Card
                          key={contract.id}
                          className="cursor-pointer hover:border-primary transition-all"
                          onClick={() => setConfirmDialog({
                            open: true,
                            title: "Contract Details",
                            description: `Contract: ${contract.title}\nStatus: ${isSigned ? '✅ Signed' : '📬 Pending'}`,
                            confirmLabel: "OK",
                            onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                          })}
                        >
                          <CardContent className="pt-5 pb-5">
                            <div className="flex justify-between items-center">
                              <div className="font-semibold">{contract.title}</div>
                              <Badge variant={isSigned ? "default" : "secondary"}>
                                {isSigned ? "Signed" : "Pending"}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Created {new Date(contract.created_at).toLocaleDateString()}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                      <div className="text-6xl mb-4">📜</div>
                      <div className="text-xl font-medium mb-2">No contracts yet</div>
                      <Button variant="outline" onClick={() => setShowCreateContract(true)}>
                        Create your first contract
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Job Full Detail Modal */}
      <Dialog open={!!selectedJobDetail} onOpenChange={() => setSelectedJobDetail(null)}>
        <DialogContent className="max-w-[1400px] w-[96vw]" style={{ maxWidth: '1400px', width: '96vw' }}>
          {selectedJobDetail && (() => {
            const job = {
              ...selectedJobDetail,
              photos: selectedJobDetail.photos || [],
              bills: selectedJobDetail.bills || [],
              documents: selectedJobDetail.documents || []
            }
            return (
              <div className="space-y-8">
                <DialogHeader className="pb-6 border-b">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-4xl truncate">{job.title}</DialogTitle>
                      <div
                        className="text-lg text-muted-foreground mt-1 cursor-pointer hover:text-primary transition-colors flex items-center gap-2 w-fit"
                        onClick={() => {
                          const tz = getDefaultTimezone(defaultTimezone)
                          const startVal = toDateTimeLocalValue(job.scheduled_start || job.scheduled_date, tz)
                          const endVal = toDateTimeLocalValue(job.scheduled_end, tz)
                          setRescheduleStart(startVal)
                          setRescheduleEnd(endVal)
                          setShowRescheduleModal(true)
                        }}
                      >
                        {job.scheduled_date || job.scheduled_start
                          ? `Scheduled: ${formatJobSchedule(job, getDefaultTimezone(defaultTimezone))}`
                          : "📅 Click to schedule a date & time"}
                        <span className="text-xs opacity-60">(click to change)</span>
                        {job.is_recurring && (
                          <div className="flex items-center gap-2 text-blue-600 text-sm">

                            {job.recurrence_end_date && <span className="text-xs opacity-70">(ends {new Date(job.recurrence_end_date).toLocaleDateString()})</span>}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => generateAndSaveInvoice(job)}
                        >
                          Generate Invoice
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setNewContractTitle(`Contract for ${job.title}`)
                            setNewContractBody('')
                            setShowCreateContract(true)
                            // Pre-link to this job
                            // We'll handle the job_id in the create handler below
                          }}
                        >
                          Create Contract
                        </Button>

                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteJob(job.id)}
                        >
                          Delete Job
                        </Button>
                      </div>
                    </div>

                    {/* RIGHT SIDE: Recurring pill + Stats pill (perfectly matched) */}
                        <div className="flex items-center gap-3">

                        {/* Recurring pill - EXACT height match to the grey Photos pill */}
                        <div
                          onClick={() => {
                            setRecurringJob(job)
                            setShowRecurringModal(true)
                          }}
                          className="cursor-pointer px-6 py-5 bg-muted/30 2xl text-sm font-medium text-muted-foreground hover:text-foreground flex items-center flex-shrink-0"
                        >
                          {job.is_recurring
                            ? `Recurring ${job.recurrence_frequency
                                ? job.recurrence_frequency.charAt(0).toUpperCase() + job.recurrence_frequency.slice(1)
                                : 'Job'}`
                            : 'Set as Recurring'
                          }
                        </div>

                          {/* Stats pill (Photos + Status) - unchanged except removed mx-auto */}
                          <div className="flex items-center justify-center gap-5 px-6 py-2 bg-muted/30 2xl">
                            <div className="text-center px-3">
                              <div className="text-2xl font-bold">{job.photos.length}</div>
                              <div className="text-xs text-muted-foreground -mt-1">Photos</div>
                            </div>
                            <div className="text-center px-3">
                              <Select
                                value={job.status}
                                modal={false}
                                onValueChange={async (newStatus) => {
                                  if (newStatus === job.status) return
                                  const { error } = await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
                                  if (!error) {
                                    loadClientData()
                                    setSelectedJobDetail(null)
                                  } else {
                                    setConfirmDialog({
                                    open: true,
                                    title: "Update Failed",
                                    description: "Failed to update status: " + error.message,
                                    confirmLabel: "OK",
                                    onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                                  })
                                  }
                                }}
                              >
                                <SelectTrigger className="h-auto p-0 border-none bg-transparent hover:bg-white/10 lg focus:ring-0">
                                  <div
                                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium text-white cursor-pointer"
                                    style={{ backgroundColor: getStatusColor(job.status) }}
                                  >
                                    {jobStatuses.find((s: any) => s.key === job.status)?.label || job.status.replace('_', ' ')}
                                  </div>
                                </SelectTrigger>
                                <SelectContent className="z-[99999] min-w-[160px]" position="popper" sideOffset={8}>
                                  {jobStatuses.length > 0 ? (
                                    jobStatuses.map((statusOption: any) => (
                                      <SelectItem key={statusOption.key} value={statusOption.key}>
                                        {statusOption.label}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <>
                                      <SelectItem value="quote_sent">Quote Sent</SelectItem>
                                      <SelectItem value="scheduled">Scheduled</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                      <SelectItem value="invoiced">Invoiced</SelectItem>
                                      <SelectItem value="paid">Paid</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="w-8 flex-shrink-0" />
                        </div>
                      </div>
                    </DialogHeader>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="border 2xl p-6 bg-card/50">
                    <div className="flex justify-between items-center mb-4">
                      <div className="font-semibold text-2xl">Bills</div>
                      <Button size="sm" onClick={() => { setSelectedJobForBill(job); setShowAddBill(true); setSelectedJobDetail(null) }}>+ Add Bill</Button>
                    </div>
                    {job.bills.length > 0 ? (
                      <div className="space-y-3 max-h-[280px] overflow-y-auto pr-2">
                        {job.bills.map((bill: any) => (
                          <div key={bill.id} className="flex justify-between items-center border-b pb-3 last:border-b-0">
                            <div>
                              <div className="font-medium">{bill.name}</div>
                              {bill.notes && <div className="text-sm text-muted-foreground mt-1">{bill.notes}</div>}
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="font-semibold text-lg">${Number(bill.amount).toFixed(2)}</div>
                              <Badge variant={bill.status === 'paid' ? 'default' : 'secondary'}>{bill.status}</Badge>
                              {bill.status !== 'paid' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMarkBillPaid(bill.id, bill.name, job.title)}
                                  className="h-7 px-2 text-xs"
                                >
                                  Mark Paid
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed xl">No bills added yet</div>
                    )}
                  </div>

                  <div className="border 2xl p-6 bg-card/50">
                    <div className="flex justify-between items-center mb-4">
                      <div className="font-semibold text-2xl">Photos ({job.photos.length})</div>
                      <Button size="sm" onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.onchange = (e) => { 
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (file) {
                            setPendingPhotoFile(file)
                            setPendingPhotoJobId(job.id)
                            setPhotoCategoryInput("General")
                          }
                        }
                        input.click()
                      }}>+ Upload Photo</Button>
                    </div>
                    {job.photos.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[280px] overflow-y-auto pr-1">
                        {Array.from(new Set(job.photos.map((p: any) => p.category)))
                          .filter(Boolean)
                          .map((category: string) => {
                            const categoryPhotos = job.photos.filter((p: any) => p.category === category).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            const latestPhoto = categoryPhotos[0]
                            return (
                              <div key={category} className="border 2xl p-4 cursor-pointer hover:border-primary transition-all group" onClick={() => { setSelectedCategoryPhotos(categoryPhotos); setSelectedCategoryName(category) }}>
                                <div className="flex justify-between items-center mb-3">
                                  <div className="font-medium">{category}</div>
                                  <div className="text-sm text-muted-foreground">{categoryPhotos.length} photos</div>
                                </div>
                                {latestPhoto && (
                                  <div className="relative">
                                    <img src={latestPhoto.file_url} className="w-full aspect-[16/9] object-cover xl border group-hover:opacity-90 transition-all" />
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                      <div className="bg-black/70 text-white px-4 py-2 full text-sm">View All {categoryPhotos.length} Photos</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed xl">No photos uploaded yet</div>
                    )}
                  </div>

                  <div className="border 2xl p-6 bg-card/50">
                    <div className="flex justify-between items-center mb-4">
                      <div className="font-semibold text-2xl">Comments</div>
                      <Button variant="ghost" size="sm" onClick={() => {
                        setConfirmDialog({
                          open: true,
                          title: "Edit Comments",
                          description: "Editing comments is not fully implemented yet (database save coming soon).",
                          confirmLabel: "OK",
                          onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                        })
                      }}>Edit</Button>
                    </div>
                    <div className="bg-muted/30 p-4 xl text-muted-foreground min-h-[120px]">
                      {job.description || "No comments added yet."}
                    </div>
                  </div>

                  <div className="border 2xl p-6 bg-card/50">
                    <div className="flex justify-between items-center mb-4">
                      <div className="font-semibold text-2xl">Documents</div>
                      <Button size="sm" onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.onchange = async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setUploading(true)
                          try {
                            const { data: { user } } = await supabase.auth.getUser()
                            if (!user) return
                            const fileName = `${job.id}/documents/${Date.now()}-${file.name}`
                            const { error: uploadError } = await supabase.storage.from('job-photos').upload(fileName, file)
                            if (uploadError) {
                              setConfirmDialog({
                                open: true,
                                title: "Upload Failed",
                                description: 'Upload failed: ' + uploadError.message,
                                confirmLabel: "OK",
                                onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                              })
                              setUploading(false)
                              return
                            }
                            const { data: { publicUrl } } = supabase.storage.from('job-photos').getPublicUrl(fileName)
                            await supabase.from('files').insert([{
                              job_id: job.id,
                              client_id: clientId,
                              user_id: user.id,
                              file_url: publicUrl,
                              file_type: 'document',
                              category: 'Document',
                              description: file.name
                            }])
                            loadClientData()
                            setSelectedJobDetail(null)
                          } catch (err: any) {
                            setConfirmDialog({
                              open: true,
                              title: "Error",
                              description: 'Error: ' + err.message,
                              confirmLabel: "OK",
                              onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                            })
                          }
                          setUploading(false)
                        }
                        input.click()
                      }} disabled={uploading}>
                        {uploading ? "Uploading..." : "+ Upload Document"}
                      </Button>
                    </div>

                    {job.documents && job.documents.length > 0 ? (
                      <div className="space-y-2 max-h-[280px] overflow-y-auto pr-2">
                        {job.documents.map((doc: any) => (
                          <div key={doc.id} className="flex justify-between items-center border-b pb-2 last:border-b-0">
                            <div className="flex items-center gap-3">
                              <div className="text-2xl">📄</div>
                              <div>
                                <div className="font-medium truncate max-w-[200px]">{doc.description}</div>
                                <div className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => window.open(doc.file_url, '_blank')}>View</Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                  setConfirmDialog({
                                    open: true,
                                    title: "Delete Document?",
                                    description: "Are you sure you want to delete this document?",
                                    confirmLabel: "Delete",
                                    destructive: true,
                                    onConfirm: async () => {
                                      setConfirmDialog(prev => ({ ...prev, open: false }))
                                      await supabase.from('files').delete().eq('id', doc.id)
                                      loadClientData()
                                      setSelectedJobDetail(null)
                                    }
                                  })
                                  await supabase.from('files').delete().eq('id', doc.id)
                                  loadClientData()
                                  setSelectedJobDetail(null)
                                }}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed xl">
                        No documents uploaded yet
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Job Modal */}
      <Dialog open={showAddJob} onOpenChange={(open) => {
        setShowAddJob(open)
        if (!open) {
          setDayBookings([])
          setAvailabilityDateKey(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Job</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddJob} className="space-y-4">
            <Input placeholder="Job Title *" value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} required />
            <Textarea placeholder="Description" value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start (optional)</Label>
                <Input type="datetime-local" value={jobForm.scheduled_start} onChange={(e) => setJobForm({ ...jobForm, scheduled_start: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">End (optional)</Label>
                <Input type="datetime-local" value={jobForm.scheduled_end} onChange={(e) => setJobForm({ ...jobForm, scheduled_end: e.target.value })} />
              </div>
            </div>

            {/* Visual daily availability timeline (professional dispatch-board style) */}
            {renderAvailabilityPanel({
              dayBookings,
              loading: availabilityLoading,
              dateKey: availabilityDateKey,
              proposedStart: jobForm.scheduled_start,
              proposedEnd: jobForm.scheduled_end,
              tz: getDefaultTimezone(defaultTimezone),
              excludeJobId: null,
              onSelectTime: (startLocal, endLocal) => {
                setJobForm({ ...jobForm, scheduled_start: startLocal, scheduled_end: endLocal })
              },
            })}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowAddJob(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">Add Job</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Estimate Modal */}
      <Dialog
        open={showCreateEstimate}
        onOpenChange={(open) => {
          if (!open) {
            setEditingEstimate(null)
            setEstimateForm({ title: '', description: '' })
            setEstimateItems([{ description: '', amount: '' }])
          }
          setShowCreateEstimate(open)
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingEstimate ? "Edit Estimate" : "Create New Estimate"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateEstimate} className="space-y-6">
            <div>
              <Label>Estimate Title *</Label>
              <Input
                placeholder="e.g. Kitchen Faucet Replacement"
                value={estimateForm.title}
                onChange={(e) => setEstimateForm({ ...estimateForm, title: e.target.value })}
                required
              />
            </div>

            {editingEstimate?.status === 'disputed' && editingEstimate?.dispute_reason && (
              <div className="bg-orange-500/10 border border-orange-500/30 2xl p-4">
                <div className="text-orange-400 font-medium mb-2 flex items-center gap-2">
                  ⚠️ Client Dispute Reason
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {editingEstimate.dispute_reason}
                </p>
              </div>
            )}

            <div>
              <Label>Description / Notes (optional)</Label>
              <Textarea
                placeholder="Additional details about the work..."
                value={estimateForm.description}
                onChange={(e) => setEstimateForm({ ...estimateForm, description: e.target.value })}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label>Line Items</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEstimateItems([...estimateItems, { description: '', amount: '' }])
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>

              <div className="space-y-3">
                {estimateItems.map((item, index) => (
                  <div key={index} className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => {
                          const newItems = [...estimateItems]
                          newItems[index].description = e.target.value
                          setEstimateItems(newItems)
                        }}
                      />
                    </div>
                    <div className="w-32">
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Amount"
                        value={item.amount}
                        onChange={(e) => {
                          const newItems = [...estimateItems]
                          newItems[index].amount = e.target.value
                          setEstimateItems(newItems)
                        }}
                      />
                    </div>
                    {estimateItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newItems = estimateItems.filter((_, i) => i !== index)
                          setEstimateItems(newItems)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreateEstimate(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={savingEstimate}>
                {savingEstimate
                  ? "Saving..."
                  : editingEstimate
                    ? "Update Estimate"
                    : "Create Estimate"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Bill Modal */}
      <Dialog open={showAddBill} onOpenChange={setShowAddBill}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Bill to {selectedJobForBill?.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddBill} className="space-y-4">
            <Input placeholder="Bill Name" value={billForm.name} onChange={(e) => setBillForm({ ...billForm, name: e.target.value })} required />
            <Input type="number" step="0.01" placeholder="Amount" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} required />
            <Textarea placeholder="Notes" value={billForm.notes} onChange={(e) => setBillForm({ ...billForm, notes: e.target.value })} />
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowAddBill(false)} className="flex-1">Cancel</Button>
              <Button type="submit" className="flex-1">Add Bill</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reschedule Modal */}
      <Dialog open={showRescheduleModal} onOpenChange={(open) => {
        setShowRescheduleModal(open)
        if (!open) {
          setDayBookings([])
          setAvailabilityDateKey(null)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule Job</DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div>
              <Label>Start Date &amp; Time</Label>
              <Input
                type="datetime-local"
                value={rescheduleStart}
                onChange={(e) => setRescheduleStart(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label>End Date &amp; Time (optional)</Label>
              <Input
                type="datetime-local"
                value={rescheduleEnd}
                onChange={(e) => setRescheduleEnd(e.target.value)}
                className="mt-2"
              />
            </div>
            {/* Visual daily availability timeline (professional dispatch-board style) */}
            {renderAvailabilityPanel({
              dayBookings,
              loading: availabilityLoading,
              dateKey: availabilityDateKey,
              proposedStart: rescheduleStart,
              proposedEnd: rescheduleEnd,
              tz: getDefaultTimezone(defaultTimezone),
              excludeJobId: selectedJobDetail?.id || null,
              onSelectTime: (startLocal, endLocal) => {
                setRescheduleStart(startLocal)
                setRescheduleEnd(endLocal)
              },
            })}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setShowRescheduleModal(false)
                setRescheduleStart("")
                setRescheduleEnd("")
                setDayBookings([])
                setAvailabilityDateKey(null)
              }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                if (!selectedJobDetail || !rescheduleStart) return

                try {
                  const tz = getDefaultTimezone(defaultTimezone)
                  const startISO = parseDateTimeLocalInTz(rescheduleStart, tz)
                  const endISO = rescheduleEnd ? parseDateTimeLocalInTz(rescheduleEnd, tz) : null

                  const updatePayload: any = {
                    scheduled_start: startISO,
                    scheduled_end: endISO,
                    // Keep old column in sync during transition
                    scheduled_date: startISO,
                  }

                  const { error } = await supabase
                    .from('jobs')
                    .update(updatePayload)
                    .eq('id', selectedJobDetail.id)

                  if (error) throw error

                  const updatedJob = {
                    ...selectedJobDetail,
                    scheduled_start: startISO,
                    scheduled_end: endISO,
                    scheduled_date: startISO,
                  }
                  setSelectedJobDetail(updatedJob)

                  loadClientData()

                  setShowRescheduleModal(false)
                  setRescheduleStart("")
                  setRescheduleEnd("")
                  setDayBookings([])
                  setAvailabilityDateKey(null)

                  setConfirmDialog({
                    open: true,
                    title: "Success",
                    description: "Job rescheduled successfully!",
                    confirmLabel: "OK",
                    onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                  })
                } catch (error: any) {
                  setConfirmDialog({
                    open: true,
                    title: "Reschedule Failed",
                    description: "Failed to reschedule: " + error.message,
                    confirmLabel: "OK",
                    onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                  })
                }
              }}
              disabled={!rescheduleStart}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recurring Job Modal */}
      <Dialog open={showRecurringModal} onOpenChange={setShowRecurringModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recurring / Maintenance Job</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Make this a recurring job</Label>
              <input
                type="checkbox"
                checked={recurringJob?.is_recurring || false}
                onChange={(e) => setRecurringJob({ ...recurringJob, is_recurring: e.target.checked })}
                className="w-5 h-5 accent-primary"
              />
            </div>

            {recurringJob?.is_recurring && (
              <>
                <div>
                  <Label>Frequency</Label>
                  <Select
                    value={recurringJob?.recurrence_frequency || ""}
                    onValueChange={(value) => setRecurringJob({ ...recurringJob, recurrence_frequency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="biweekly">Every 2 weeks</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>End date (optional)</Label>
                  <Input
                    type="date"
                    value={recurringJob?.recurrence_end_date ? new Date(recurringJob.recurrence_end_date).toISOString().slice(0, 10) : ""}
                    onChange={(e) => setRecurringJob({ ...recurringJob, recurrence_end_date: e.target.value || null })}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setShowRecurringModal(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => handleSetRecurring({
              is_recurring: recurringJob?.is_recurring || false,
              frequency: recurringJob?.recurrence_frequency,
              end_date: recurringJob?.recurrence_end_date
            })}>
              Save Recurring Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Photo Viewer */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center" onClick={() => setSelectedPhoto(null)}>
          <img src={selectedPhoto} className="max-w-[95%] max-h-[95%] object-contain lg" onClick={(e) => e.stopPropagation()} />
          <Button variant="ghost" size="icon" className="absolute top-6 right-6 bg-black/60 hover:bg-black/80 text-white full h-14 w-14 text-2xl z-50" onClick={() => setSelectedPhoto(null)}>✕</Button>
        </div>
      )}

      {/* Messages Modal */}
      <Dialog open={showMessagesModal} onOpenChange={setShowMessagesModal}>
        <DialogContent className="max-w-[1200px] w-[96vw]" style={{ maxWidth: '1200px', width: '96vw' }}>
          <DialogHeader>
            <DialogTitle>Messages with {client.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6 border 2xl bg-muted/10 min-h-[400px]">
            {messages.length > 0 ? (
              <div className="space-y-4">
                {messages.map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.is_from_client ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] 3xl px-5 py-3.5 ${msg.is_from_client ? 'bg-gray-200 text-black' : 'bg-blue-600 text-white'}`}>
                      <div className="text-[15px] leading-relaxed">{msg.content}</div>
                      <div className={`text-[10px] mt-1.5 ${msg.is_from_client ? 'text-black/60' : 'text-white/60'}`}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <div className="text-6xl mb-4">💬</div>
                  <div className="text-xl font-medium mb-2">No messages yet</div>
                  <div className="text-sm">Start the conversation below</div>
                </div>
              </div>
            )}
          </div>
          <div className="pt-4 border-t">
            <div className="flex gap-3">
              <Input placeholder="Type your message..." className="flex-1 h-12 2xl" onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                  console.log("Send:", e.currentTarget.value)
                  e.currentTarget.value = ""
                }
              }} />
              <Button className="h-12 px-8 2xl">Send</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Professional shared ConfirmDialog */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        destructive={confirmDialog.destructive}
      />

      {/* Category selector for newly chosen photo */}
      <Dialog open={!!pendingPhotoFile} onOpenChange={(open) => { if (!open) { setPendingPhotoFile(null); setPendingPhotoJobId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Photo Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label>Category for this photo</Label>
            <Input 
              value={photoCategoryInput} 
              onChange={(e) => setPhotoCategoryInput(e.target.value)} 
              placeholder="e.g. Rough-in, Final, Materials" 
            />
            <p className="text-xs text-muted-foreground">This helps organize photos in both the admin view and client portal.</p>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => { setPendingPhotoFile(null); setPendingPhotoJobId(null); }}>Cancel</Button>
            <Button 
              className="flex-1" 
              onClick={confirmPhotoUploadWithCategory} 
              disabled={uploading || !pendingPhotoFile}
            >
              {uploading ? "Uploading..." : "Upload Photo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Photos Viewer (for viewing the stack of photos in one category) */}
      <Dialog open={selectedCategoryPhotos.length > 0} onOpenChange={() => { setSelectedCategoryPhotos([]); setSelectedCategoryName(""); }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Photos — {selectedCategoryName} ({selectedCategoryPhotos.length})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto py-4">
            {selectedCategoryPhotos.map((photo: any, idx: number) => (
              <div 
                key={idx} 
                className="border cursor-pointer overflow-hidden group" 
                onClick={() => setSelectedPhoto(photo.file_url)}
              >
                <img 
                  src={photo.file_url} 
                  className="w-full aspect-video object-cover group-hover:opacity-90 transition-all" 
                  alt={photo.description || selectedCategoryName} 
                />
                <div className="p-2 text-xs text-muted-foreground truncate border-t">
                  {photo.description || new Date(photo.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Updated Create Contract Modal - fixed Select + job linking */}
      <Dialog open={showCreateContract} onOpenChange={setShowCreateContract}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Contract</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Job Link Selector */}
            <div>
              <Label>Link to Job (optional)</Label>
              <Select
                value={selectedJobForContract || "none"}
                onValueChange={(value) => setSelectedJobForContract(value === "none" ? "" : value)}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="General contract (client level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">General contract (no specific job)</SelectItem>
                  {jobs.map((job: any) => (
                    <SelectItem key={job.id} value={job.id}>
                      {job.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div>
              <Label>Contract Title *</Label>
              <Input
                placeholder="e.g. Service Agreement - Kitchen Remodel"
                value={newContractTitle}
                onChange={(e) => setNewContractTitle(e.target.value)}
              />
            </div>

            {/* Body */}
            <div>
              <Label>Contract Terms / Body</Label>
              <Textarea
                placeholder="Full contract text, terms, scope of work, payment schedule, etc..."
                value={newContractBody}
                onChange={(e) => setNewContractBody(e.target.value)}
                rows={12}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowCreateContract(false)
                  setNewContractTitle('')
                  setNewContractBody('')
                  setSelectedJobForContract('')
                }}
              >
                Cancel
              </Button>

              <Button
                className="flex-1"
                onClick={async () => {
                  if (!newContractTitle.trim()) {
                    setConfirmDialog({
                      open: true,
                      title: "Validation Error",
                      description: "Title is required",
                      confirmLabel: "OK",
                      onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                    })
                    return
                  }

                  const { error } = await supabase.from('contracts').insert({
                    client_id: clientId,
                    job_id: selectedJobForContract || null,   // null = general contract
                    title: newContractTitle,
                    body: newContractBody || '',
                    status: 'draft'
                  })

                  if (!error) {
                    setNewContractTitle('')
                    setNewContractBody('')
                    setSelectedJobForContract('')
                    setShowCreateContract(false)
                    loadContracts()
                    setConfirmDialog({
                      open: true,
                      title: "Success",
                      description: "Contract created successfully!",
                      confirmLabel: "OK",
                      onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                    })
                  } else {
                    setConfirmDialog({
                      open: true,
                      title: "Error",
                      description: 'Error creating contract: ' + error.message,
                      confirmLabel: "OK",
                      onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                    })
                  }
                }}
              >
                Create Contract
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Client Dialog */}
      <Dialog open={showEditClient} onOpenChange={setShowEditClient}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name</Label>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>Address</Label>
              <Textarea
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                rows={3}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setShowEditClient(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleUpdateClient}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
