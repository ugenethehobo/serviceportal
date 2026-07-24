'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { MainPageCard } from '@/components/ui/main-page-card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MobileListCard } from '@/components/ui/mobile-list-card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getClientPortalStatusAction,
  inviteClientToPortalAction,
  createClientPortalUserAction,
  setClientPortalEnabledAction,
  revokeClientPortalAccessAction,
  revokeClientPortalUserAction,
  updateClientPortalUserAction,
  setClientPortalUserPasswordAction,
  sendClientPortalUserPasswordResetAction,
  startClientPortalPreviewAction,
  type ClientPortalLoginUser,
} from '@/app/action'
import {
  PORTAL_ACCESS_DURATION_LABELS,
  formatPortalAccessExpiry,
  type PortalAccessDuration,
} from '@/lib/portal-users'
import { getPasswordRequirementsHint } from '@/lib/password-policy'
import {
  MOBILE_LIST_STACK_CLASS,
  MOBILE_NATURAL_HEIGHT_CLASS,
  MOBILE_SCROLL_VIEWPORT_CLASS,
  MOBILE_TABLE_DESKTOP_ONLY_CLASS,
} from '@/lib/mobile-layout'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ExternalLink,
  KeyRound,
  Loader2,
  Mail,
  Pencil,
  Shield,
  UserPlus,
  UserX,
} from 'lucide-react'

interface ClientPortalAccessProps {
  clientId: string
  clientEmail?: string | null
  timezone?: string
}

type PortalStatus = {
  portalEnabled: boolean
  portalInvitedAt: string | null
  hasPortalUser: boolean
  portalUserEmail: string | null
  clientEmail: string | null
  users: ClientPortalLoginUser[]
}

type PendingDelete =
  | null
  | { kind: 'user'; user: ClientPortalLoginUser }
  | { kind: 'all' }

const ACCESS_DURATIONS = Object.keys(
  PORTAL_ACCESS_DURATION_LABELS
) as PortalAccessDuration[]

function AccessDurationSelect({
  value,
  onChange,
  id,
  disabled,
}: {
  value: PortalAccessDuration
  onChange: (value: PortalAccessDuration) => void
  id?: string
  disabled?: boolean
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange((next ?? 'none') as PortalAccessDuration)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue>
          {PORTAL_ACCESS_DURATION_LABELS[value] || PORTAL_ACCESS_DURATION_LABELS.none}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {ACCESS_DURATIONS.map((key) => (
          <SelectItem key={key} value={key}>
            {PORTAL_ACCESS_DURATION_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ClientPortalAccess({
  clientId,
  clientEmail,
  timezone,
}: ClientPortalAccessProps) {
  const [status, setStatus] = useState<PortalStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isPasswordOpen, setIsPasswordOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ClientPortalLoginUser | null>(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [inviteDuration, setInviteDuration] = useState<PortalAccessDuration>('none')

  const [manualEmail, setManualEmail] = useState('')
  const [manualPassword, setManualPassword] = useState('')
  const [manualFullName, setManualFullName] = useState('')
  const [manualDuration, setManualDuration] = useState<PortalAccessDuration>('none')

  const [editFullName, setEditFullName] = useState('')
  /** `keep` leaves the existing expiry unchanged. */
  const [editDuration, setEditDuration] = useState<PortalAccessDuration | 'keep'>('keep')
  const [setPasswordValue, setSetPasswordValue] = useState('')

  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isStartingPreview, setIsStartingPreview] = useState(false)

  const loadStatus = useCallback(async () => {
    const result = await getClientPortalStatusAction(clientId)
    if (result.success && result.status) {
      setLoadError(null)
      setStatus({
        ...result.status,
        users: result.status.users ?? [],
      })
    } else if (!result.success) {
      setLoadError(result.error || 'Failed to load portal access')
      setStatus(null)
    }
    setIsLoading(false)
  }, [clientId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const openInvite = () => {
    setInviteEmail(status?.clientEmail || clientEmail || '')
    setInviteFullName('')
    setInviteDuration('none')
    setIsInviteOpen(true)
  }

  const openManual = () => {
    setManualEmail(status?.clientEmail || clientEmail || '')
    setManualPassword('')
    setManualFullName('')
    setManualDuration('none')
    setIsManualOpen(true)
  }

  const openEdit = (user: ClientPortalLoginUser) => {
    setSelectedUser(user)
    setEditFullName(user.fullName || '')
    setEditDuration('keep')
    setIsEditOpen(true)
  }

  const openSetPassword = (user: ClientPortalLoginUser) => {
    setSelectedUser(user)
    setSetPasswordValue('')
    setIsPasswordOpen(true)
  }

  const handleInvite = async () => {
    setIsBusy(true)
    const result = await inviteClientToPortalAction(clientId, window.location.origin, {
      email: inviteEmail,
      fullName: inviteFullName || undefined,
      accessDuration: inviteDuration,
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
      accessDuration: manualDuration,
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

  const handleEditSave = async () => {
    if (!selectedUser) return
    setIsBusy(true)
    const result = await updateClientPortalUserAction({
      clientId,
      userId: selectedUser.id,
      fullName: editFullName,
      ...(editDuration === 'keep' ? {} : { accessDuration: editDuration }),
    })
    if (result.success) {
      toast.success('Login updated')
      setIsEditOpen(false)
      setSelectedUser(null)
      await loadStatus()
    } else {
      toast.error(result.error || 'Failed to update login')
    }
    setIsBusy(false)
  }

  const handleSetPassword = async () => {
    if (!selectedUser) return
    setIsBusy(true)
    const result = await setClientPortalUserPasswordAction({
      clientId,
      userId: selectedUser.id,
      password: setPasswordValue,
    })
    if (result.success) {
      toast.success('Password updated')
      setIsPasswordOpen(false)
      setSetPasswordValue('')
      setSelectedUser(null)
    } else {
      toast.error(result.error || 'Failed to set password')
    }
    setIsBusy(false)
  }

  const handleSendReset = async (user: ClientPortalLoginUser) => {
    setIsBusy(true)
    const result = await sendClientPortalUserPasswordResetAction({
      clientId,
      userId: user.id,
    })
    if (result.success) {
      toast.success(`Password reset email sent to ${user.email || 'user'}`)
    } else {
      toast.error(result.error || 'Failed to send reset email')
    }
    setIsBusy(false)
  }

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsBusy(true)
    const result = await setClientPortalEnabledAction(clientId, enabled)
    if (result.success) {
      await loadStatus()
      toast.success(enabled ? 'Portal enabled' : 'Portal disabled')
    } else {
      toast.error(result.error || 'Failed to update portal access')
    }
    setIsBusy(false)
  }

  const handlePreviewPortal = async () => {
    setIsStartingPreview(true)
    const result = await startClientPortalPreviewAction(clientId)
    if (!result.success) {
      toast.error(result.error || 'Failed to open portal preview')
      setIsStartingPreview(false)
      return
    }
    // Same-tab so the preview cookie is definitely available on navigation.
    window.location.href = result.portalPath
  }

  const confirmPendingDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    if (pendingDelete.kind === 'user') {
      const result = await revokeClientPortalUserAction(clientId, pendingDelete.user.id)
      if (result.success) {
        toast.success('Login removed')
        setPendingDelete(null)
        await loadStatus()
      } else {
        toast.error(result.error || 'Failed to remove login')
      }
    } else {
      const result = await revokeClientPortalAccessAction(clientId)
      if (result.success) {
        toast.success('Portal access revoked')
        setPendingDelete(null)
        await loadStatus()
      } else {
        toast.error(result.error || 'Failed to revoke access')
      }
    }
    setIsDeleting(false)
  }

  if (isLoading) {
    return (
      <MainPageCard className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Loading portal access…</p>
      </MainPageCard>
    )
  }

  if (loadError) {
    return (
      <MainPageCard className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Shield className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Portal management unavailable</p>
        <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
      </MainPageCard>
    )
  }

  const users = status?.users ?? []
  const hasUsers = users.length > 0
  const activeUsers = users.filter((u) => !u.isExpired).length

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-4',
        MOBILE_NATURAL_HEIGHT_CLASS
      )}
    >
      <MainPageCard className="min-h-0 flex-1 gap-0 overflow-hidden p-0">
        {/* Toolbar */}
        <div className="flex shrink-0 flex-col gap-4 border-b p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Client Portal</h2>
              {hasUsers ? (
                <Badge variant={status?.portalEnabled ? 'outline' : 'secondary'}>
                  {status?.portalEnabled ? 'Enabled' : 'Disabled'}
                </Badge>
              ) : (
                <Badge variant="secondary">No logins</Badge>
              )}
              {hasUsers ? (
                <span className="text-sm text-muted-foreground">
                  {activeUsers} active · {users.length} total
                </span>
              ) : null}
            </div>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Manage household logins, access time limits, and passwords. Clients use these
              accounts to view jobs, estimates, documents, and pay invoices.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            {hasUsers ? (
              <div className="flex items-center gap-2.5">
                <Switch
                  checked={Boolean(status?.portalEnabled)}
                  onCheckedChange={(checked) => void handleToggleEnabled(Boolean(checked))}
                  disabled={isBusy}
                />
                <span className="text-sm font-medium">Portal enabled</span>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 max-md:w-full max-md:flex-col max-md:[&_button]:w-full">
              <Button size="sm" onClick={openInvite} disabled={isBusy}>
                <Mail className="size-4" />
                Invite login
              </Button>
              <Button size="sm" variant="outline" onClick={openManual} disabled={isBusy}>
                <UserPlus className="size-4" />
                Add with password
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePreviewPortal()}
                disabled={isBusy || isStartingPreview}
              >
                {isStartingPreview ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                {isStartingPreview ? 'Opening…' : 'Preview portal'}
              </Button>
              {hasUsers ? (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={isBusy}
                  onClick={() => setPendingDelete({ kind: 'all' })}
                >
                  <UserX className="size-4" />
                  Revoke all
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Users */}
        <ScrollArea
          className={cn('min-h-0 flex-1', MOBILE_NATURAL_HEIGHT_CLASS)}
          viewportClassName={cn('scroll-fade', MOBILE_SCROLL_VIEWPORT_CLASS)}
        >
          <div className="p-4 sm:p-5">
            {hasUsers ? (
              <>
                <div
                  className={cn(
                    'overflow-hidden rounded-lg border p-px',
                    MOBILE_TABLE_DESKTOP_ONLY_CLASS
                  )}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="min-w-0">
                            <div className="flex flex-col gap-0.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-medium">
                                  {user.fullName || user.email || 'Portal user'}
                                </span>
                                {user.isPrimary ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    Primary
                                  </Badge>
                                ) : null}
                              </div>
                              <span className="break-all text-xs text-muted-foreground">
                                {user.email || 'No email'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatPortalAccessExpiry(user.accessExpiresAt, timezone)}
                          </TableCell>
                          <TableCell>
                            {user.isExpired ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : status?.portalEnabled ? (
                              <Badge variant="outline">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => openEdit(user)}
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => openSetPassword(user)}
                              >
                                <KeyRound className="size-3.5" />
                                Set password
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isBusy || !user.email}
                                onClick={() => void handleSendReset(user)}
                              >
                                <Mail className="size-3.5" />
                                Reset email
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={isBusy}
                                onClick={() => setPendingDelete({ kind: 'user', user })}
                              >
                                Remove
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className={MOBILE_LIST_STACK_CLASS}>
                  {users.map((user) => (
                    <MobileListCard key={user.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="break-words text-base font-semibold">
                            {user.fullName || user.email || 'Portal user'}
                          </p>
                          <p className="break-all text-sm text-muted-foreground">
                            {user.email || 'No email'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Access: {formatPortalAccessExpiry(user.accessExpiresAt, timezone)}
                          </p>
                        </div>
                        {user.isExpired ? (
                          <Badge variant="destructive" className="shrink-0">
                            Expired
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="shrink-0">
                            {status?.portalEnabled ? 'Active' : 'Disabled'}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={isBusy}
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={isBusy}
                          onClick={() => openSetPassword(user)}
                        >
                          Set password
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          disabled={isBusy || !user.email}
                          onClick={() => void handleSendReset(user)}
                        >
                          Reset email
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full text-destructive hover:text-destructive"
                          disabled={isBusy}
                          onClick={() => setPendingDelete({ kind: 'user', user })}
                        >
                          Remove
                        </Button>
                      </div>
                    </MobileListCard>
                  ))}
                </div>
              </>
            ) : (
              <Card className="flex flex-col items-center gap-3 border-dashed p-8 text-center shadow-none">
                <Shield className="size-8 text-muted-foreground" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">No portal logins yet</p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    Invite a household member by email, or create a login with a temporary
                    password. You can set a time limit or leave access unlimited.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" onClick={openInvite}>
                    <Mail className="size-4" />
                    Send invite
                  </Button>
                  <Button size="sm" variant="outline" onClick={openManual}>
                    <KeyRound className="size-4" />
                    Set password manually
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </ScrollArea>
      </MainPageCard>

      {/* Invite dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasUsers ? 'Invite another portal login' : 'Invite to portal'}
            </DialogTitle>
            <DialogDescription>
              They receive an email to set up their own password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="invite-name">Full name (optional)</Label>
              <Input
                id="invite-name"
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                className="mt-1"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1"
                placeholder="spouse@example.com"
              />
            </div>
            <div>
              <Label htmlFor="invite-duration">Access time limit</Label>
              <div className="mt-1">
                <AccessDurationSelect
                  id="invite-duration"
                  value={inviteDuration}
                  onChange={setInviteDuration}
                  disabled={isBusy}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose “No time limit” for permanent access.
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
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {isBusy ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual create dialog */}
      <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasUsers ? 'Add portal login' : 'Create portal login'}
            </DialogTitle>
            <DialogDescription>
              Create a login with a temporary password you share securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="manual-name">Full name (optional)</Label>
              <Input
                id="manual-name"
                value={manualFullName}
                onChange={(e) => setManualFullName(e.target.value)}
                className="mt-1"
                placeholder="John Smith"
              />
            </div>
            <div>
              <Label htmlFor="manual-email">Email</Label>
              <Input
                id="manual-email"
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="manual-password">Temporary password</Label>
              <Input
                id="manual-password"
                type="password"
                value={manualPassword}
                onChange={(e) => setManualPassword(e.target.value)}
                className="mt-1"
                placeholder={getPasswordRequirementsHint()}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {getPasswordRequirementsHint()}. They can change it after login.
              </p>
            </div>
            <div>
              <Label htmlFor="manual-duration">Access time limit</Label>
              <div className="mt-1">
                <AccessDurationSelect
                  id="manual-duration"
                  value={manualDuration}
                  onChange={setManualDuration}
                  disabled={isBusy}
                />
              </div>
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

      {/* Edit user dialog */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open)
          if (!open) setSelectedUser(null)
        }}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Edit portal login</DialogTitle>
            <DialogDescription>
              Update display name or access time limit for{' '}
              {selectedUser?.email || 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="edit-duration">Access time limit</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current:{' '}
                {formatPortalAccessExpiry(selectedUser?.accessExpiresAt, timezone)}
              </p>
              <div className="mt-1">
                <Select
                  value={editDuration}
                  onValueChange={(next) =>
                    setEditDuration((next ?? 'keep') as PortalAccessDuration | 'keep')
                  }
                  disabled={isBusy}
                >
                  <SelectTrigger id="edit-duration" className="w-full">
                    <SelectValue>
                      {editDuration === 'keep'
                        ? 'Keep current limit'
                        : PORTAL_ACCESS_DURATION_LABELS[editDuration]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep current limit</SelectItem>
                    {ACCESS_DURATIONS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {PORTAL_ACCESS_DURATION_LABELS[key]}
                        {key !== 'none' ? ' (from now)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Choosing a new duration restarts the clock from now. “No time limit”
                removes expiry.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleEditSave()} disabled={isBusy}>
              {isBusy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Set password dialog */}
      <Dialog
        open={isPasswordOpen}
        onOpenChange={(open) => {
          setIsPasswordOpen(open)
          if (!open) {
            setSelectedUser(null)
            setSetPasswordValue('')
          }
        }}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              Set a temporary password for {selectedUser?.email || 'this login'}. Share it
              securely.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="set-password">New password</Label>
              <Input
                id="set-password"
                type="password"
                value={setPasswordValue}
                onChange={(e) => setSetPasswordValue(e.target.value)}
                className="mt-1"
                placeholder={getPasswordRequirementsHint()}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {getPasswordRequirementsHint()}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSetPassword()}
              disabled={isBusy || !setPasswordValue}
            >
              {isBusy ? 'Saving…' : 'Update password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'all'
                ? 'Revoke all portal access?'
                : 'Remove portal login?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'all'
                ? 'No one for this client will be able to sign in to the portal. This cannot be undone.'
                : `Remove access for ${
                    pendingDelete?.kind === 'user'
                      ? pendingDelete.user.email ||
                        pendingDelete.user.fullName ||
                        'this login'
                      : 'this login'
                  }?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault()
                void confirmPendingDelete()
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Working…
                </>
              ) : pendingDelete?.kind === 'all' ? (
                'Revoke all'
              ) : (
                'Remove'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
