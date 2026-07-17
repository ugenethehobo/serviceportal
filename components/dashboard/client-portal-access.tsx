'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  CardHeader,
  CardTitle,
  CardContent,
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
  revokeClientPortalUserAction,
  type ClientPortalLoginUser,
} from '@/app/action'
import { getPasswordRequirementsHint } from '@/lib/password-policy'
import { toast } from 'sonner'
import { ExternalLink, KeyRound, Mail, UserPlus, UserX } from 'lucide-react'

interface ClientPortalAccessProps {
  clientId: string
  clientEmail?: string | null
}

type PortalStatus = {
  portalEnabled: boolean
  portalInvitedAt: string | null
  hasPortalUser: boolean
  portalUserEmail: string | null
  clientEmail: string | null
  users: ClientPortalLoginUser[]
}

export function ClientPortalAccess({ clientId, clientEmail }: ClientPortalAccessProps) {
  const [status, setStatus] = useState<PortalStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [manualEmail, setManualEmail] = useState('')
  const [manualPassword, setManualPassword] = useState('')
  const [manualFullName, setManualFullName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')

  const loadStatus = useCallback(async () => {
    const result = await getClientPortalStatusAction(clientId)
    if (result.success && result.status) {
      setStatus({
        ...result.status,
        users: result.status.users ?? [],
      })
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  const openInvite = () => {
    setInviteEmail(status?.clientEmail || clientEmail || '')
    setInviteFullName('')
    setIsInviteOpen(true)
  }

  const openManual = () => {
    setManualEmail(status?.clientEmail || clientEmail || '')
    setManualPassword('')
    setManualFullName('')
    setIsManualOpen(true)
  }

  const handleInvite = async () => {
    setIsBusy(true)
    const result = await inviteClientToPortalAction(clientId, window.location.origin, {
      email: inviteEmail,
      fullName: inviteFullName || undefined,
    })
    if (result.success) {
      toast.success('Portal invite sent')
      setIsInviteOpen(false)
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
      fullName: manualFullName || undefined,
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

  const handleRevokeUser = async (user: ClientPortalLoginUser) => {
    const label = user.email || user.fullName || 'this login'
    if (!confirm(`Remove portal access for ${label}?`)) return
    setIsBusy(true)
    const result = await revokeClientPortalUserAction(clientId, user.id)
    if (result.success) {
      toast.success('Login removed')
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to remove login')
    }
    setIsBusy(false)
  }

  const handleRevokeAll = async () => {
    if (
      !confirm(
        'Revoke all portal logins? No one for this client will be able to sign in.'
      )
    ) {
      return
    }
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

  const users = status?.users ?? []
  const hasUsers = users.length > 0

  return (
    <div className="space-y-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-semibold text-lg">Client Portal</CardTitle>
          {hasUsers && (
            <Badge variant={status?.portalEnabled ? 'outline' : 'secondary'}>
              {status?.portalEnabled ? 'Active' : 'Disabled'}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Give household members their own logins (for example spouses) so they can
          both view jobs and pay.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {hasUsers ? (
          <>
            <ul className="space-y-2">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {user.fullName || user.email || 'Portal user'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email || 'No email'}
                      {user.isPrimary ? ' · Primary' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    disabled={isBusy}
                    onClick={() => void handleRevokeUser(user)}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2">
              <Switch
                checked={Boolean(status?.portalEnabled)}
                onCheckedChange={(checked) => void handleToggleEnabled(Boolean(checked))}
                disabled={isBusy}
              />
              <span className="text-sm">Portal access enabled for all logins</span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No portal logins yet. Invite by email or set a temporary password.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={openInvite} disabled={isBusy}>
            <Mail className="size-4" />
            {hasUsers ? 'Invite another login' : 'Send invite'}
          </Button>
          <Button size="sm" variant="outline" onClick={openManual} disabled={isBusy}>
            <KeyRound className="size-4" />
            {hasUsers ? 'Add login with password' : 'Set password manually'}
          </Button>
          {hasUsers ? (
            <>
              <a
                href="/portal"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="size-4" />
                Preview portal
              </a>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleRevokeAll()}
                disabled={isBusy}
                className="h-8 gap-2 px-2"
              >
                <UserX className="size-4" />
                Revoke all
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>

      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasUsers ? 'Invite another portal login' : 'Invite to portal'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full name (optional)</Label>
              <Input
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                className="mt-1"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1"
                placeholder="spouse@example.com"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                They receive an email to set up their own password.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleInvite()}
              disabled={isBusy || !inviteEmail.trim()}
            >
              <UserPlus className="size-4" />
              {isBusy ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasUsers ? 'Add portal login' : 'Create portal login'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full name (optional)</Label>
              <Input
                value={manualFullName}
                onChange={(e) => setManualFullName(e.target.value)}
                className="mt-1"
                placeholder="John Smith"
              />
            </div>
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
                placeholder={getPasswordRequirementsHint()}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {getPasswordRequirementsHint()}. Share it securely; they can change it after login.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsManualOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleManualCreate()} disabled={isBusy}>
              {isBusy ? 'Creating…' : 'Create login'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
