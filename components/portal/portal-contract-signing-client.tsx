'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  getPortalContractSigningPageAction,
  signPortalContractAction,
  type PortalContractSigningData,
} from '@/app/portal/contract-actions'
import { SignaturePad, type SignaturePadHandle } from '@/components/portal/signature-pad'
import { PortalPageHeader } from '@/components/portal/portal-page-header'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { CheckCircle2, FileText, Loader2 } from 'lucide-react'

interface PortalContractSigningClientProps {
  contractId: string
  initialData: PortalContractSigningData
}

export function PortalContractSigningClient({
  contractId,
  initialData,
}: PortalContractSigningClientProps) {
  const router = useRouter()
  const signatureRef = useRef<SignaturePadHandle>(null)
  const initialsRef = useRef<SignaturePadHandle>(null)

  const [data, setData] = useState(initialData)
  const [signedName, setSignedName] = useState(initialData.clientName)
  const [fieldValues, setFieldValues] = useState(initialData.fieldValues)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loadPdf = useCallback(async () => {
    if (!data.documentId) return
    setIsLoadingPdf(true)
    try {
      const response = await fetch(`/api/documents/${data.documentId}/view`)
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load contract PDF')
      }
      setPdfUrl(payload.url)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not load contract PDF'
      toast.error(message)
    } finally {
      setIsLoadingPdf(false)
    }
  }, [data.documentId])

  useEffect(() => {
    void loadPdf()
  }, [loadPdf])

  const handleSubmit = async () => {
    if (!data.canSign) return

    setIsSubmitting(true)
    const result = await signPortalContractAction(contractId, {
      signedName,
      fieldValues,
      signatureDataUrl: data.requirements.requiresSignature
        ? signatureRef.current?.toDataUrl()
        : null,
      initialsDataUrl: data.requirements.requiresInitials
        ? initialsRef.current?.toDataUrl()
        : null,
    })

    if (result.success) {
      toast.success('Contract signed successfully')
      const refreshed = await getPortalContractSigningPageAction(contractId)
      if (refreshed.success) {
        setData(refreshed.data)
      } else {
        setData((current) => ({
          ...current,
          canSign: false,
          contract: result.contract,
        }))
      }
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to sign contract')
    }
    setIsSubmitting(false)
  }

  const isSigned = data.contract.status === 'signed'

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      <PortalPageHeader
        title={data.contract.title}
        description={`${data.contract.number} · ${data.companyName}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isSigned ? 'default' : 'secondary'}>{data.contract.statusLabel}</Badge>
        {isSigned && data.contract.signedAt ? (
          <span className="text-sm text-muted-foreground">
            Signed {new Date(data.contract.signedAt).toLocaleString()}
            {data.contract.signedName ? ` by ${data.contract.signedName}` : ''}
          </span>
        ) : null}
      </div>

      <Card className="overflow-hidden shadow-sm">
        <div className="border-b px-5 py-3 flex items-center gap-2 text-sm font-medium">
          <FileText className="size-4" />
          Contract preview
        </div>
        <div className="bg-muted/30 p-4 min-h-[420px]">
          {isLoadingPdf ? (
            <Skeleton className="h-[480px] w-full rounded-lg" />
          ) : pdfUrl ? (
            <iframe
              title="Contract PDF preview"
              src={pdfUrl}
              className="h-[min(70vh,640px)] w-full rounded-lg border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Contract PDF preview is not available yet.
            </p>
          )}
        </div>
      </Card>

      {isSigned ? (
        <Card className="p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="size-5 text-green-600 mt-0.5" />
            <div className="space-y-2">
              <p className="font-medium">You signed this contract</p>
              <p className="text-sm text-muted-foreground">
                A signed copy is saved in your Documents folder under Contracts.
              </p>
              <Link
                href="/portal/documents"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                View documents
              </Link>
            </div>
          </div>
        </Card>
      ) : data.canSign ? (
        <Card className="p-6 shadow-sm space-y-6">
          <div>
            <h2 className="font-semibold text-lg">Sign agreement</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review the contract above, complete any required fields, and sign below.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signed-name">Full legal name</Label>
            <Input
              id="signed-name"
              value={signedName}
              onChange={(event) => setSignedName(event.target.value)}
              placeholder="Your full name"
              autoComplete="name"
            />
          </div>

          {data.requirements.inputFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Textarea
                id={field.key}
                value={fieldValues[field.key] || ''}
                onChange={(event) =>
                  setFieldValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                rows={3}
              />
            </div>
          ))}

          {data.requirements.requiresSignature ? (
            <SignaturePad ref={signatureRef} label="Signature" />
          ) : null}

          {data.requirements.requiresInitials ? (
            <SignaturePad ref={initialsRef} label="Initials" height={96} />
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit signature'
              )}
            </Button>
            <Link
              href="/portal/documents"
              className={buttonVariants({ variant: 'outline' })}
            >
              Back to documents
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">
            This contract is not ready for signing yet. Check back later or contact your service
            provider.
          </p>
          <Link
            href="/portal/documents"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-4' })}
          >
            Back to documents
          </Link>
        </Card>
      )}
    </div>
  )
}