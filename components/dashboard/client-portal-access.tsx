'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getClientPortalStatusAction,
  inviteClientToPortalAction,
  createClientPortalUserAction,
  setClientPortalEnabledAction,
  revokeClientPortalAccessAction,
} from '@/app/action'
import { toast } from 'sonner'
import { ExternalLink, KeyRound, Mail, UserX } from 'lucide-react'

interface ClientPortalAccessProps {
  clientId: string
  clientEmail?: string | null
}

export function ClientPortalAccess({ clientId, clientEmail }: ClientPortalAccessProps) {
  const [status, setStatus] = useState<{
    portalEnabled: boolean
    portalInvitedAt: string | null
    hasPortalUser: boolean
    portalUserEmail: string | null
    clientEmail: string | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [manualPassword, setManualPassword] = useState('')

  const loadStatus = useCallback(async () => {
    const result = await getClientPortalStatusAction(clientId)
    if (result.success && result.status) {
      setStatus(result.status)
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const handleInvite = async () => {
    setIsBusy(true)
    const result = await inviteClientToPortalAction(clientId, window.location.origin)
    if (result.success) {
      toast.success('Portal invite sent')
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to send invite')
    }
    setIsBusy(false)
  }

  const handleManualCreate = async () => {
    setIsBusy(true)
    const result = await createClientPortalUserAction({
      clientId,
      email: manualEmail,
      password: manualPassword,
    })
    if (result.success) {
      toast.success('Portal login created')
      setIsManualOpen(false)
      setManualPassword('')
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to create login')
    }
    setIsBusy(false)
  }

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsBusy(true)
    const result = await setClientPortalEnabledAction(clientId, enabled)
    if (result.success) {
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to update portal access')
    }
    setIsBusy(false)
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke portal access? The client will no longer be able to sign in.')) return
    setIsBusy(true)
    const result = await revokeClientPortalAccessAction(clientId)
    if (result.success) {
      toast.success('Portal access revoked')
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to revoke access')
    }
    setIsBusy(false)
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading portal settings...</p>
  }

  const emailForInvite = status?.clientEmail || clientEmail

  return (
    <div className="space-y-4">
      <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="font-semibold text-lg">
          Client Portal
        </CardTitle>
        {status?.hasPortalUser && (
          <Badge variant={status.portalEnabled ? 'outline' : 'secondary'}>
            {status.portalEnabled ? 'Active' : 'Disabled'}
          </Badge>
        )}
      </div>
      </CardHeader>


      {!status?.hasPortalUser ? (
        <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={handleInvite}
            disabled={isBusy || !emailForInvite}
          >
            <Mail className="size-4" />
            Send invite
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setManualEmail(emailForInvite || '')
              setIsManualOpen(true)
            }}
            disabled={isBusy}
          >
            <KeyRound className="size-4" />
            Set password manually
          </Button>
          {!emailForInvite && (
            <p className="text-xs text-muted-foreground w-full">
              Add a client email in Contact Information before sending an invite.
            </p>
          )}
        </div>
        </CardContent>
      ) : (
        <CardContent>
        <div className="space-y-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Login email: </span>
            <span className="font-medium">{status.portalUserEmail}</span>
          </div>
          {status.portalInvitedAt && (
            <div className="text-xs text-muted-foreground">
              Invited {new Date(status.portalInvitedAt).toLocaleDateString()}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch
              checked={status.portalEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isBusy}
            />
            <span className="text-sm">Portal access enabled</span>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href="/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="size-4" />
              Preview portal
            </a>
            <Button size="sm" variant="destructive" onClick={handleRevoke} disabled={isBusy} className="h-8 gap-2 px-2">
              <UserX className="size-4" />
              Revoke access
            </Button>
          </div>
        </div>
        </CardContent>
      )}

      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Create portal login</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                className="mt-1"
                placeholder="8+ characters"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsManualOpen(false)}>Cancel</Button>
            <Button onClick={handleManualCreate} disabled={isBusy}>
              {isBusy ? 'Creating...' : 'Create login'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
