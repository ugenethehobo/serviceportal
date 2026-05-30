'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog, AlertDialog } from "@/components/ui/confirm-dialog"
import ClientMessaging from './ClientMessaging'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ThemeToggle } from "@/components/theme-toggle"
import { Calendar, Clock, Image as ImageIcon, MessageCircle, Home } from "lucide-react"
import React from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Job {
  id: string
  title: string
  status: string
  scheduled_date: string | null
  description: string | null
  files: any[]
  bills: any[]
}

export default function ClientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = React.use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const [currentPage, setCurrentPage] = useState(1)
  const [companySettings, setCompanySettings] = useState<any>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [client, setClient] = useState<any>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [selectedCategoryPhotos, setSelectedCategoryPhotos] = useState<any[]>([])
  const [selectedCategoryName, setSelectedCategoryName] = useState("")
  const [loading, setLoading] = useState(true)
  const [isProcessingPayment, setIsProcessingPayment] = useState(false)
  const [jobStatuses, setJobStatuses] = useState<any[]>([])
  const [portalRightPanel, setPortalRightPanel] = useState<'jobs' | 'estimates'>('jobs')
  const [estimates, setEstimates] = useState<any[]>([])
  const [selectedEstimate, setSelectedEstimate] = useState<any>(null)
  const [disputeReason, setDisputeReason] = useState("")
  const [isSubmittingDispute, setIsSubmittingDispute] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [isProcessingAction, setIsProcessingAction] = useState(false)
  const [contracts, setContracts] = useState<any[]>([])
  const [selectedContractToSign, setSelectedContractToSign] = useState<any>(null)
  const [signerName, setSignerName] = useState('')
  const [agreed, setAgreed] = useState(false)

  // Shared professional modal state (replacing native alerts)
  const [confirmDialog, setConfirmDialog] = useState<any>({ open: false })

  const supabase = createClient()

  const loadData = async () => {
    const { data: tokenData } = await supabase
      .from('portal_tokens')
      .select('client_id')
      .eq('token', token)
      .single()

    if (!tokenData) {
      setLoading(false)
      return
    }

    const [{ data: clientData }, { data: jobsData }, { data: estimatesData }, { data: settings }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', tokenData.client_id).single(),
        supabase.from('jobs')
          .select(`*, files (*), bills (*)`)
          .eq('client_id', tokenData.client_id)
          .order('scheduled_date', { ascending: true, nullsFirst: false }),
        supabase.from('estimates')
          .select(`id, title, description, status, total, user_id, dispute_reason, created_at, estimate_items (*)`)
          .eq('client_id', tokenData.client_id)
          .order('created_at', { ascending: false }),
        supabase.from('company_settings')
          .select('company_name, logo_url, primary_color')
          .single()
    ])
    // Load contracts
    const { data: contractsData } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_signatures(*)
      `)
      .eq('client_id', tokenData.client_id)
      .order('created_at', { ascending: false })

    setContracts(contractsData || [])
    setCompanySettings(settings)
    setClient(clientData)
    setEstimates(estimatesData || [])

    // Classify files into photos and documents (same logic as admin)
    const jobsWithPhotosAndDocs = (jobsData || []).map((job: any) => {
      const allFiles = job.files || []

      return {
        ...job,
        photos: allFiles.filter((f: any) =>
          f.file_type === 'photo' ||
          f.file_type === 'image' ||
          (f.category && f.category.toLowerCase().includes('photo'))
        ),
        documents: allFiles.filter((f: any) =>
          f.file_type === 'document' ||
          f.category === 'Invoice' ||
          (f.description && f.description.startsWith('Invoice for'))
        )
      }
    })

    setJobs(jobsWithPhotosAndDocs)

    // Load custom job statuses
    if (jobsData && jobsData.length > 0) {
      const userId = jobsData[0].user_id
      const { data: settings } = await supabase
        .from('company_settings')
        .select('job_statuses')
        .eq('user_id', userId)
        .single()

      if (settings?.job_statuses && Array.isArray(settings.job_statuses)) {
        setJobStatuses(settings.job_statuses)
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
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [token])

  // Handle return from Stripe Checkout (success or cancel). This fixes the back button / navigation issue.
  // Stripe redirects back to /portal/[token] with query params. We verify server-side then clean the URL.
  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    const sessionId = searchParams.get('session_id')

    if (!paymentStatus) return

    const cleanPortalUrl = () => {
      router.replace(`/portal/${token}`, { scroll: false })
    }

    const processReturn = async () => {
      if (paymentStatus === 'success' && sessionId) {
        setIsProcessingPayment(true)
        try {
          const response = await fetch('/api/confirm-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, portalToken: token }),
          })
          const result = await response.json()

          if (result.success) {
            await loadData()
            setConfirmDialog({
              open: true,
              title: "Payment Successful",
              description: "Thank you! Your payment has been processed and the bills are now marked as paid.",
              confirmLabel: "Return to Portal",
              onConfirm: () => {
                setConfirmDialog({ open: false })
                cleanPortalUrl()
                setIsProcessingPayment(false)
              }
            })
          } else {
            setConfirmDialog({
              open: true,
              title: "Payment Confirmation",
              description: result.error || "We received the return from Stripe but could not auto-confirm. Please refresh to see updated status.",
              confirmLabel: "OK",
              onConfirm: () => {
                setConfirmDialog({ open: false })
                cleanPortalUrl()
                setIsProcessingPayment(false)
              }
            })
          }
        } catch (e) {
          setConfirmDialog({
            open: true,
            title: "Payment Received",
            description: "Your payment completed successfully on Stripe. Refresh this page to see the updated billing status.",
            confirmLabel: "OK",
            onConfirm: () => {
              setConfirmDialog({ open: false })
              cleanPortalUrl()
              setIsProcessingPayment(false)
            }
          })
        }
      } else if (paymentStatus === 'cancelled') {
        setConfirmDialog({
          open: true,
          title: "Payment Cancelled",
          description: "Your payment was cancelled. No charges were made. You can try again from the Billing section.",
          confirmLabel: "OK",
          onConfirm: () => {
            setConfirmDialog({ open: false })
            cleanPortalUrl()
          }
        })
      }
    }

    processReturn()
  }, [searchParams, token])

  // Dynamic status helpers
  const getStatusInfo = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)
    if (found) {
      return {
        label: found.label,
        color: found.color
      }
    }
    return { label: status.replace('_', ' '), color: '#64748b' }
  }

  const getLightStatusColor = (status: string) => {
    const found = jobStatuses.find((s: any) => s.key === status)
    if (found?.color) {
      return {
        backgroundColor: `${found.color}15`,
        borderColor: `${found.color}60`,
      }
    }
    return {
      backgroundColor: '#f8fafc',
      borderColor: '#e2e8f0',
    }
  }

  const handlePayBill = async (bill: any, job: any) => {
    setIsProcessingPayment(true)
    try {
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billIds: [bill.id],
          jobId: job.id,
          clientEmail: client.email,
          portalToken: token,
        }),
      })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setConfirmDialog({
          open: true,
          title: "Payment Error",
          description: "Error: " + (data.error || "Unknown error"),
          confirmLabel: "OK",
          onConfirm: () => {
            setConfirmDialog({ open: false })
            setIsProcessingPayment(false)
          }
        })
      }
    } catch (error) {
      setConfirmDialog({
        open: true,
        title: "Error",
        description: "Something went wrong. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => {
          setConfirmDialog({ open: false })
          setIsProcessingPayment(false)
        }
      })
    }
  }

  const handleApproveEstimate = async () => {
    if (!selectedEstimate) return

    setIsProcessingAction(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Get the first available job status dynamically
      const firstJobStatus = jobStatuses.length > 0
        ? jobStatuses[0].key
        : 'quote_sent'

      // 1. Create the Job
      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          client_id: client.id,
          user_id: selectedEstimate.user_id || user?.id,
          title: selectedEstimate.title,
          description: selectedEstimate.description || null,
          status: firstJobStatus,
          estimate_id: selectedEstimate.id,
        })
        .select()
        .single()

      if (jobError) {
        console.error("Job creation error:", jobError)
        throw jobError
      }

      // 2. Create Bills from estimate items (NO client_id)
      if (selectedEstimate.estimate_items?.length > 0) {
        const billsToCreate = selectedEstimate.estimate_items.map((item: any) => ({
          job_id: newJob.id,
          name: item.description,
          amount: item.amount,
          status: 'pending',
        }))

        const { error: billsError } = await supabase.from('bills').insert(billsToCreate)
        if (billsError) throw billsError
      }

      // 3. Mark estimate as approved
      await supabase
        .from('estimates')
        .update({ status: 'approved' })
        .eq('id', selectedEstimate.id)

      await loadData()
      setSelectedEstimate({ ...selectedEstimate, status: 'approved' })

      setConfirmDialog({
        open: true,
        title: "Success",
        description: "Estimate approved! A new job and bills have been created.",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })

    } catch (error: any) {
      console.error("Full approval error:", error)
      setConfirmDialog({
        open: true,
        title: "Error",
        description: "Something went wrong while approving the estimate.",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } finally {
      setIsProcessingAction(false)
    }
  }

  const handleDisputeEstimate = async () => {
    if (!selectedEstimate || !disputeReason.trim()) return

    setIsSubmittingDispute(true)

    const { error } = await supabase
      .from('estimates')
      .update({
        status: 'disputed',
        dispute_reason: disputeReason
      })
      .eq('id', selectedEstimate.id)

    if (!error) {
      await loadData()

      const updatedEstimate = {
        ...selectedEstimate,
        status: 'disputed',
        dispute_reason: disputeReason
      }
      setSelectedEstimate(updatedEstimate)

      setDisputeReason("")
      setShowDisputeForm(false)

      setConfirmDialog({
        open: true,
        title: "Submitted",
        description: "Your dispute has been submitted. The admin will review it.",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    } else {
      setConfirmDialog({
        open: true,
        title: "Error",
        description: "Failed to submit dispute. Please try again.",
        confirmLabel: "OK",
        onConfirm: () => setConfirmDialog({ open: false })
      })
    }

    setIsSubmittingDispute(false)
  }

  const generateAndSaveContractPDF = async (contract: any) => {
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
          y += 55
        } catch (e) {
          console.log("Could not load logo")
        }
      }

      // === COMPANY NAME (directly under logo) ===
      doc.setFontSize(24)
      doc.setFont('helvetica', 'bold')
      doc.text(settings?.company_name || 'ServicePortal', 20, y)

      // === COMPANY CONTACT INFO ===
      y += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      if (settings?.company_address) doc.text(settings.company_address, 20, y)
      y += 5
      if (settings?.company_phone) doc.text(`Phone: ${settings.company_phone}`, 20, y)
      y += 5
      if (settings?.company_email) doc.text(`Email: ${settings.company_email}`, 20, y)

      // === CONTRACT TITLE ===
      y += 15
      doc.setFontSize(22)
      doc.text(contract.title.toUpperCase(), pageWidth / 2, y, { align: 'center' })

      // === CONTRACT BODY ===
      y += 15
      const splitBody = doc.splitTextToSize(contract.body || 'No contract body provided.', pageWidth - 40)
      doc.setFontSize(11)
      doc.text(splitBody, 20, y)

      y += splitBody.length * 7 + 20

      // === SIGNATURE BLOCK ===
      doc.setFontSize(12)
      doc.text('Digitally Signed', 20, y)
      y += 8
      doc.setFontSize(11)
      doc.text(`Signed by: ${contract.contract_signatures?.[0]?.signer_name || 'Client'}`, 20, y)
      y += 6
      doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, 20, y)

      // === FOOTER ===
      doc.setFontSize(9)
      doc.text('This is a digitally signed document.', pageWidth / 2, 280, { align: 'center' })

      const pdfBlob = doc.output('blob')
      const fileName = `Contract-${contract.title.replace(/\s+/g, '-')}-${Date.now()}.pdf`

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const folder = contract.job_id ? contract.job_id : `contracts-general`
      const filePath = `${folder}/contracts/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('job-photos')
        .upload(filePath, pdfBlob, { contentType: 'application/pdf' })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('job-photos')
        .getPublicUrl(filePath)

      await supabase.from('files').insert({
        job_id: contract.job_id || null,
        client_id: contract.client_id,
        user_id: user.id,
        file_url: publicUrl,
        category: 'Contract',
        description: `${contract.title} - Signed`
      })

      await supabase
        .from('contracts')
        .update({ pdf_url: publicUrl })
        .eq('id', contract.id)

      loadData()

      console.log('✅ Professional contract PDF generated')

    } catch (e: any) {
      console.error('Contract PDF error:', e)
    }
  }

  const allPhotos = jobs.flatMap((job: any) =>
    ((job.photos || job.files?.filter((f: any) => f.file_type === 'photo') || [])).map((file: any) => ({
      ...file,
      jobTitle: job.title
    }))
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md text-center">
          <CardHeader>
            <div className="text-6xl mb-4">🔒</div>
            <CardTitle>Portal Unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">This link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Fixed Header */}
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {companySettings?.logo_url ? (
            <img
              src={companySettings.logo_url}
              alt={companySettings.company_name || 'Company'}
              className="h-10 w-auto object-contain"
            />
          ) : (
            <div className="h-10 w-10 bg-primary rounded-none flex items-center justify-center text-white font-bold text-2xl">
              SP
            </div>
          )}
          <div>
            <div className="font-bold text-2xl">
              {companySettings?.company_name || 'ServicePortal'}
            </div>
            <div className="text-xs text-muted-foreground -mt-1">Secure Client Portal</div>
          </div>
        </div>

          <div className="flex items-center gap-2">
            <Button
              variant={currentPage === 1 ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(1)}
            >
              <Home className="mr-2 h-4 w-4" />
              Dashboard
            </Button>
            <Button
              variant={currentPage === 2 ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentPage(2)}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Messages
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right text-sm hidden sm:block">
              <div className="text-muted-foreground">Welcome back,</div>
              <div className="font-medium">{client.name}</div>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {currentPage === 1 && (
          <>
            {/* Hero Stats */}
            <div className="mb-10">
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <div className="text-3xl sm:text-4xl font-bold tracking-tight">Hi {client.name.split(' ')[0]},</div>
                  <div className="text-lg sm:text-xl text-muted-foreground mt-1">Here's everything happening with your projects</div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
                  <div className="bg-card border rounded-none px-4 sm:px-6 py-2 sm:py-3 text-center">
                    <div className="text-2xl sm:text-3xl font-semibold">{jobs.length}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Total Jobs</div>
                  </div>
                  <div className="bg-card border rounded-none px-4 sm:px-6 py-2 sm:py-3 text-center">
                    <div className="text-2xl sm:text-3xl font-semibold text-blue-600">
                      {jobs.filter(j => j.scheduled_date && new Date(j.scheduled_date) > new Date()).length}
                    </div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Upcoming</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b mb-10" />

            {/* 4-Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* TOP LEFT: Jobs + Estimates (Tabbed) */}
            <div className="bg-card border rounded-none p-6">
              {/* Tab Headers - mobile friendly */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div className="flex border-b overflow-x-auto">
                  <button
                    onClick={() => setPortalRightPanel('jobs')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      portalRightPanel === 'jobs'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Jobs
                  </button>
                  <button
                    onClick={() => setPortalRightPanel('estimates')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      portalRightPanel === 'estimates'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Estimates ({estimates.length})
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              {portalRightPanel === 'jobs' ? (
                /* Jobs Content */
                jobs.length > 0 ? (
                  <div className="space-y-4">
                    {jobs.map((job) => (
                      <Card
                        key={job.id}
                        className={`overflow-hidden border-2 transition-all ${getLightStatusColor(job.status)}`}
                      >
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                            <div className="min-w-0">
                              <CardTitle className="text-lg sm:text-xl">{job.title}</CardTitle>
                              {job.scheduled_date && (
                                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  {new Date(job.scheduled_date).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                            <Badge className={getStatusInfo(job.status).color + " shrink-0"}>
                              {getStatusInfo(job.status).label}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">
                            {job.description || "No description provided."}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center text-muted-foreground">
                      No jobs yet
                    </CardContent>
                  </Card>
                )
              ) : (
                /* Estimates Content */
                estimates.length > 0 ? (
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {estimates.map((estimate) => {
                    const items = estimate.estimate_items || []
                    const total = estimate.total || 0

                    return (
                      <div
                        key={estimate.id}
                        className="border rounded-none p-4 hover:border-primary transition-all cursor-pointer"
                        onClick={() => {
                          setSelectedEstimate(estimate)
                          setDisputeReason("")
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-semibold">{estimate.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(estimate.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold">${total}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-6xl mb-4">📄</div>
                    <div className="text-xl font-medium mb-2">No estimates yet</div>
                  </div>
                )
              )}
            </div>

              {/* TOP RIGHT: Billing */}
              <div className="bg-card border rounded-none p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-6 h-6">💳</div>
                  <div>
                    <div className="font-semibold text-2xl">Billing</div>
                    <div className="text-sm text-muted-foreground">Your charges & payments</div>
                  </div>
                </div>

                {jobs.length > 0 ? (
                  <div className="space-y-6">
                    {jobs.map((job) => {
                      const jobBills = job.bills || []
                      const totalDue = jobBills
                        .filter((b: any) => b.status === 'pending')
                        .reduce((sum: number, b: any) => sum + Number(b.amount), 0)

                      if (jobBills.length === 0) return null

                      return (
                        <div key={job.id} className="border-b pb-6 last:border-b-0 last:pb-0">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-4">
                            <div>
                              <div className="font-semibold text-lg">{job.title}</div>
                              <div className="text-sm text-muted-foreground">
                                {jobBills.length} charges
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-semibold text-emerald-600">
                                ${totalDue.toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground">Total Due</div>
                            </div>
                          </div>

                          <div className="space-y-3">
                            {jobBills.map((bill: any) => (
                              <div key={bill.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm">
                                <div className="flex-1">
                                  <div>{bill.name}</div>
                                  {bill.notes && (
                                    <div className="text-xs text-muted-foreground mt-0.5">{bill.notes}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="font-medium">${Number(bill.amount).toFixed(2)}</div>
                                  {bill.status === 'pending' ? (
                                    <Button
                                      size="sm"
                                      disabled={isProcessingPayment}
                                      onClick={() => handlePayBill(bill, job)}
                                      className="bg-emerald-600 hover:bg-emerald-700 min-h-[36px] px-4 text-xs sm:text-sm"
                                    >
                                      {isProcessingPayment ? "..." : "Pay Now"}
                                    </Button>
                                  ) : (
                                    <Badge variant="default" className="bg-emerald-500 text-xs">Paid</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                    {/* Total Outstanding */}
                    <div className="pt-6 border-t">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4">
                        <div className="font-semibold text-xl">Total Outstanding</div>
                        <div className="text-2xl font-semibold text-emerald-600">
                          ${jobs.reduce((sum: number, job: any) => {
                            const pending = (job.bills || []).filter((b: any) => b.status === 'pending')
                              .reduce((s: number, b: any) => s + Number(b.amount), 0)
                            return sum + pending
                          }, 0).toFixed(2)}
                        </div>
                      </div>
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-lg py-6"
                        disabled={isProcessingPayment}
                        onClick={async () => {
                          const allPendingBills = jobs.flatMap(job =>
                            (job.bills || []).filter((b: any) => b.status === 'pending')
                          )
                          if (allPendingBills.length === 0) {
                            setConfirmDialog({
                              open: true,
                              title: "No Bills",
                              description: "No pending bills to pay",
                              confirmLabel: "OK",
                              onConfirm: () => setConfirmDialog({ open: false })
                            })
                            return
                          }
                          const billIds = allPendingBills.map(b => b.id)
                          const jobWithPendingBills = jobs.find(job =>
                            (job.bills || []).some((b: any) => b.status === 'pending')
                          )
                          if (!jobWithPendingBills) return

                          setIsProcessingPayment(true)
                          try {
                            const response = await fetch('/api/create-checkout', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                billIds,
                                jobId: jobWithPendingBills.id,
                                clientEmail: client.email,
                                portalToken: token,
                              }),
                            })
                            const data = await response.json()
                            if (data.url) {
                              window.location.href = data.url
                            } else {
                              setConfirmDialog({
                                open: true,
                                title: "Payment Error",
                                description: "Error: " + (data.error || "Unknown error"),
                                confirmLabel: "OK",
                                onConfirm: () => {
                                  setConfirmDialog({ open: false })
                                  setIsProcessingPayment(false)
                                }
                              })
                            }
                          } catch (error) {
                            setConfirmDialog({
                              open: true,
                              title: "Error",
                              description: "Something went wrong. Please try again.",
                              confirmLabel: "OK",
                              onConfirm: () => {
                                setConfirmDialog({ open: false })
                                setIsProcessingPayment(false)
                              }
                            })
                          }
                        }}
                      >
                        {isProcessingPayment ? "Processing Payment..." : "Pay Total Outstanding"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-6xl mb-4">💳</div>
                    <div className="text-xl font-medium mb-2">No billing yet</div>
                  </div>
                )}
              </div>

              {/* BOTTOM LEFT: Documents */}
              <div className="bg-card border rounded-none p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-6 h-6">📄</div>
                  <div>
                    <div className="font-semibold text-2xl">Documents</div>
                    <div className="text-sm text-muted-foreground">Project files, invoices & contracts</div>
                  </div>
                </div>

                {jobs.some((job: any) => job.documents?.length > 0) || contracts.length > 0 ? (
                  <div className="space-y-4 max-h-[320px] overflow-y-auto pr-1">

                    {/* === INVOICES & OTHER DOCUMENTS (100% UNCHANGED) === */}
                    {jobs.flatMap((job: any) =>
                      (job.documents || []).map((doc: any) => (
                        <div
                          key={doc.id}
                          className="flex justify-between items-center border rounded-none p-4 hover:border-primary transition-all"
                        >
                          <div>
                            <div className="font-medium">{doc.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {new Date(doc.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(doc.file_url, '_blank')}
                          >
                            View
                          </Button>
                        </div>
                      ))
                    )}

                    {/* === CONTRACTS WITH DIRECT PDF_URL VIEW BUTTON === */}
                    {contracts.map((contract: any) => {
                      const isSigned = contract.contract_signatures && contract.contract_signatures.length > 0

                      return (
                        <div
                          key={contract.id}
                          className="flex justify-between items-center border rounded-none p-4 hover:border-primary transition-all"
                        >
                          <div>
                            <div className="font-medium">{contract.title}</div>
                            <div className="text-xs text-muted-foreground">
                              Created {new Date(contract.created_at).toLocaleDateString()}
                            </div>
                          </div>

                          {isSigned ? (
                            <div className="flex items-center gap-3">
                              <Badge variant="default" className="bg-emerald-600/50">Signed</Badge>
                              {contract.pdf_url ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => window.open(contract.pdf_url, '_blank')}
                                >
                                  View
                                </Button>
                              ) : (
                                <Button variant="outline" size="sm" disabled>
                                  View
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedContractToSign(contract)
                                setSignerName('')
                                setAgreed(false)
                              }}
                            >
                              Sign Contract
                            </Button>
                          )}
                        </div>
                      )
                    })}

                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-6xl mb-4">📁</div>
                    <div className="text-xl font-medium mb-2">No documents yet</div>
                  </div>
                )}
              </div>

              {/* BOTTOM RIGHT: Photos */}
              <div className="bg-card border rounded-none p-6">
                <div className="flex items-center gap-3 mb-6">
                  <ImageIcon className="w-6 h-6" />
                  <div>
                    <div className="font-semibold text-2xl">Project Photos</div>
                    <div className="text-sm text-muted-foreground">{allPhotos.length} total photos</div>
                  </div>
                </div>
                {allPhotos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from(new Set(allPhotos.map((p: any) => p.category || 'General'))).map((category: string) => {
                      const categoryPhotos = allPhotos.filter((p: any) => (p.category || 'General') === category)
                      const latestPhoto = categoryPhotos[0]
                      return (
                        <div
                          key={category}
                          className="border rounded-none p-4 cursor-pointer hover:border-primary transition-all group"
                          onClick={() => {
                            setSelectedCategoryPhotos(categoryPhotos)
                            setSelectedCategoryName(category)
                          }}
                        >
                          <div className="flex justify-between items-center mb-3">
                            <div className="font-medium">{category}</div>
                            <div className="text-sm text-muted-foreground">{categoryPhotos.length} photos</div>
                          </div>
                          {latestPhoto && (
                            <div className="relative">
                              <img src={latestPhoto.file_url} className="w-full aspect-[16/9] object-cover rounded-none border group-hover:opacity-90 transition-all" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                                <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm">
                                  View All {categoryPhotos.length} Photos
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-6xl mb-4">📷</div>
                    <div className="text-xl font-medium mb-2">No photos yet</div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* PAGE 2: Messages */}
        {currentPage === 2 && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <MessageCircle className="w-6 h-6" />
              <div>
                <div className="font-semibold text-2xl">Messages</div>
                <div className="text-sm text-muted-foreground">Chat with your service provider</div>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <ClientMessaging clientId={client.id} />
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Fullscreen Photo Viewer */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center" onClick={() => setSelectedPhoto(null)}>
          <img src={selectedPhoto} className="max-w-[95%] max-h-[95%] object-contain rounded-none" onClick={(e) => e.stopPropagation()} />
          <Button variant="ghost" size="icon" className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-black/60 hover:bg-black/80 text-white rounded-full h-12 w-12 sm:h-14 sm:w-14 text-2xl z-50" onClick={() => setSelectedPhoto(null)}>
            ✕
          </Button>
        </div>
      )}

      {/* Category Photo Gallery Modal */}
      <Dialog open={selectedCategoryPhotos.length > 0} onOpenChange={() => { setSelectedCategoryPhotos([]); setSelectedCategoryName("") }}>
        <DialogContent className="max-w-6xl w-[98vw] sm:w-auto max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCategoryName} Photos ({selectedCategoryPhotos.length})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[70vh] overflow-y-auto p-2">
            {selectedCategoryPhotos.map((photo: any, index) => (
              <div key={index} className="relative group cursor-pointer" onClick={() => setSelectedPhoto(photo.file_url)}>
                <img src={photo.file_url} className="w-full aspect-square object-cover rounded-none border hover:opacity-90 transition-all" />
                <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                  {new Date(photo.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* All Photos Gallery Modal */}
      <Dialog open={showAllPhotos} onOpenChange={setShowAllPhotos}>
        <DialogContent className="max-w-6xl w-[98vw] sm:w-auto max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>All Project Photos ({allPhotos.length})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 max-h-[70vh] overflow-y-auto p-2">
            {allPhotos.map((photo, index) => (
              <div key={index} className="aspect-square rounded-none overflow-hidden cursor-pointer border" onClick={() => { setShowAllPhotos(false); setSelectedPhoto(photo.file_url) }}>
                <img src={photo.file_url} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Estimate Detail Modal */}
      <Dialog
        open={!!selectedEstimate}
        onOpenChange={() => {
          setSelectedEstimate(null)
          setDisputeReason("")
          setShowDisputeForm(false)
        }}
      >
        <DialogContent
          className="max-w-3xl w-[95vw]"
          style={{ maxWidth: '800px', width: '95vw' }}
        >
          {selectedEstimate && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl pr-8">{selectedEstimate.title}</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                {/* Notes */}
                {selectedEstimate.description && (
                  <div>
                    <div className="text-sm font-medium text-muted-foreground mb-1">Notes</div>
                    <p className="text-sm whitespace-pre-wrap">{selectedEstimate.description}</p>
                  </div>
                )}

                {/* Line Items */}
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-3">Line Items</div>
                  <div className="border rounded-none divide-y">
                    {selectedEstimate.estimate_items?.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between px-4 py-3 text-sm">
                        <span>{item.description}</span>
                        <span className="font-medium">${Number(item.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between px-4 pt-4 font-semibold">
                    <span>Total</span>
                    <span>${Number(selectedEstimate.total).toFixed(2)}</span>
                  </div>
                </div>

                {/* === LOCKED STATE === */}
                {['approved', 'disputed'].includes(selectedEstimate.status) ? (
                  <div className="pt-4 border-t">
                    {selectedEstimate.status === 'approved' && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-none p-4 text-center">
                        <div className="text-emerald-400 font-medium">✓ Estimate Approved</div>
                        <p className="text-sm text-muted-foreground mt-1">
                          This estimate has been approved. The admin will create a job shortly.
                        </p>
                      </div>
                    )}

                    {selectedEstimate.status === 'disputed' && (
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-none p-4">
                        <div className="text-orange-400 font-medium mb-2">Estimate Disputed</div>
                        <p className="text-sm text-muted-foreground">
                          You disputed this estimate. The admin will review and update it.
                        </p>
                        {selectedEstimate.dispute_reason && (
                          <div className="mt-3 p-3 bg-black/30 rounded-none text-sm">
                            <span className="font-medium">Your reason:</span><br />
                            {selectedEstimate.dispute_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* === ACTIVE STATE (can still approve/dispute) === */
                  <>
                    {!showDisputeForm ? (
                      <div className="flex flex-col sm:flex-row gap-3 pt-4">
                        <Button variant="outline" className="flex-1" onClick={() => setSelectedEstimate(null)}>
                          Close
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1"
                          onClick={() => setShowDisputeForm(true)}
                        >
                          Dispute Estimate
                        </Button>
                        <Button
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                          onClick={handleApproveEstimate}
                          disabled={isProcessingAction}
                        >
                          {isProcessingAction ? "Approving..." : "Approve Estimate"}
                        </Button>
                      </div>
                    ) : (
                      /* Dispute Form */
                      <div className="space-y-4 pt-4 border-t">
                        <div>
                          <Label>Reason for Dispute</Label>
                          <Textarea
                            placeholder="Please explain why you're disputing this estimate..."
                            value={disputeReason}
                            onChange={(e) => setDisputeReason(e.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              setShowDisputeForm(false)
                              setDisputeReason("")
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1"
                            onClick={handleDisputeEstimate}
                            disabled={!disputeReason.trim() || isSubmittingDispute}
                          >
                            {isSubmittingDispute ? "Submitting..." : "Submit Dispute"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Digital Signature Modal */}
      <Dialog open={!!selectedContractToSign} onOpenChange={() => setSelectedContractToSign(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign Contract: {selectedContractToSign?.title}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[420px] overflow-y-auto bg-muted/30 p-6 rounded-none text-sm leading-relaxed border">
            {selectedContractToSign?.body || "Contract terms would appear here."}
          </div>

          <div className="space-y-4 mt-6">
            <div>
              <Label>Full Legal Name</Label>
              <Input
                placeholder="Enter your full name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 accent-primary"
              />
              <Label className="cursor-pointer text-sm">
                I agree to the terms above and consent to this digital signature
              </Label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" className="flex-1" onClick={() => setSelectedContractToSign(null)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!signerName.trim() || !agreed}
                onClick={async () => {
                  if (!selectedContractToSign) return

                  const { error } = await supabase
                    .from('contract_signatures')
                    .insert({
                      contract_id: selectedContractToSign.id,
                      signer_name: signerName,
                    })

                  if (!error) {
                    // Auto-generate PDF after successful signature
                    await generateAndSaveContractPDF(selectedContractToSign)

                    setSelectedContractToSign(null)
                    loadData()
                    setConfirmDialog({
                      open: true,
                      title: "Success",
                      description: "Contract signed and PDF generated!",
                      confirmLabel: "OK",
                      onConfirm: () => setConfirmDialog({ open: false })
                    })
                  } else {
                    setConfirmDialog({
                      open: true,
                      title: "Error",
                      description: "Failed to sign contract",
                      confirmLabel: "OK",
                      onConfirm: () => setConfirmDialog({ open: false })
                    })
                  }
                }}
              >
                Sign Digitally
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="text-center py-12 text-xs text-muted-foreground border-t mt-12">
        Secure Client Portal • Powered by ServicePortal
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog({ ...confirmDialog, open })}
        title={confirmDialog.title || ""}
        description={confirmDialog.description || ""}
        confirmLabel={confirmDialog.confirmLabel || "OK"}
        onConfirm={confirmDialog.onConfirm || (() => setConfirmDialog({ open: false }))}
      />
    </div>
  )
}
