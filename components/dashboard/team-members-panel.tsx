'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createCompanyTeamMemberAction,
  deleteCompanyTeamMemberAction,
  getCompanyTeamMembersAction,
  updateCompanyTeamMemberAction,
  type CompanyTeamMember,
} from '@/app/action'
import { getCompanySubscriptionAccessAction } from '@/app/action'
import { ImageAttachmentField } from '@/components/admin/image-attachment-field'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { MainPageCard, MainPageCardScroll } from '@/components/ui/main-page-card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getSeatLimitMessage } from '@/lib/platform-entitlements'
import type { PlanEntitlements } from '@/lib/platform-entitlements'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type TeamMemberForm = {
  displayName: string
  email: string
  password: string
  role: 'team_member' | 'company_admin'
}

function isBlobUrl(url: string | null | undefined): url is string {
  return Boolean(url?.startsWith('blob:'))
}

function revokeBlobUrl(url: string | null) {
  if (isBlobUrl(url)) URL.revokeObjectURL(url)
}

function roleLabel(role: string) {
  return role === 'company_admin' ? 'Admin' : 'Team Member'
}

export function TeamMembersPanel() {
  const supabase = createClient()
  const [members, setMembers] = useState<CompanyTeamMember[]>([])
  const [seatsUsed, setSeatsUsed] = useState(0)
  const [seatLimit, setSeatLimit] = useState(10)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<CompanyTeamMember | null>(null)
  const [memberToDelete, setMemberToDelete] = useState<CompanyTeamMember | null>(null)
  const [form, setForm] = useState<TeamMemberForm>({
    displayName: '',
    email: '',
    password: '',
    role: 'team_member',
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [avatarRemoved, setAvatarRemoved] = useState(false)

  const atSeatLimit = seatsUsed >= seatLimit
  const seatUpgradeMessage =
    entitlements && atSeatLimit
      ? getSeatLimitMessage(entitlements.plan, seatLimit)
      : null

  const loadMembers = useCallback(async () => {
    const result = await getCompanyTeamMembersAction()
    if (result.success) {
      setMembers(result.members)
      setSeatsUsed(result.seatsUsed)
      setSeatLimit(result.seatLimit)
      setCurrentUserId(result.currentUserId)
    } else {
      toast.error(result.error || 'Failed to load team members')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      const accessResult = await getCompanySubscriptionAccessAction()
      if (accessResult.success) {
        setEntitlements(accessResult.entitlements)
      }
      await loadMembers()
    })()
  }, [loadMembers])

  const resetPhotoState = (preview: string | null = null) => {
    revokeBlobUrl(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(preview)
    setAvatarRemoved(false)
  }

  const resetForm = () => {
    setForm({ displayName: '', email: '', password: '', role: 'team_member' })
    resetPhotoState(null)
    setEditingMember(null)
  }

  const openCreateModal = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (member: CompanyTeamMember) => {
    setEditingMember(member)
    setForm({
      displayName: member.name,
      email: member.email,
      password: '',
      role: member.role === 'company_admin' ? 'company_admin' : 'team_member',
    })
    resetPhotoState(member.avatar_url)
    setIsModalOpen(true)
  }

  const handlePhotoFileSelect = (file: File) => {
    revokeBlobUrl(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setAvatarRemoved(false)
  }

  const handlePhotoRemove = () => {
    revokeBlobUrl(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    setAvatarRemoved(true)
  }

  const uploadAvatar = async (existingUrl?: string | null) => {
    let avatarUrl = existingUrl || null
    if (avatarRemoved) avatarUrl = null

    if (photoFile) {
      const fileExt = photoFile.name.split('.').pop()
      const fileName = `user-${Date.now()}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-avatars')
        .upload(fileName, photoFile)

      if (uploadError) throw uploadError

      const { data: publicUrl } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(uploadData.path)

      avatarUrl = publicUrl.publicUrl
    }

    return avatarUrl
  }

  const handleSave = async () => {
    if (!form.displayName.trim() || !form.email.trim()) {
      toast.error('Display name and email are required')
      return
    }

    setIsSaving(true)

    try {
      const avatarUrl = await uploadAvatar(editingMember?.avatar_url)

      if (editingMember) {
        const result = await updateCompanyTeamMemberAction({
          userId: editingMember.id,
          displayName: form.displayName.trim(),
          password: form.password.trim() || undefined,
          role: form.role,
          avatarUrl,
        })

        if (!result.success) {
          toast.error(result.error || 'Failed to update team member')
          return
        }

        toast.success('Team member updated')
      } else {
        const result = await createCompanyTeamMemberAction({
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          password: form.password.trim() || undefined,
          role: form.role,
          avatarUrl,
          origin: window.location.origin,
        })

        if (!result.success) {
          toast.error(result.error || 'Failed to add team member')
          return
        }

        toast.success(
          result.invited
            ? 'Invite email sent'
            : 'Team member account created'
        )
      }

      setIsModalOpen(false)
      resetForm()
      await loadMembers()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save team member'
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!memberToDelete) return

    const result = await deleteCompanyTeamMemberAction(
      memberToDelete.id,
      memberToDelete.avatar_url
    )

    if (!result.success) {
      toast.error(result.error || 'Failed to remove team member')
      return
    }

    toast.success('Team member removed')
    setIsDeleteOpen(false)
    setMemberToDelete(null)
    await loadMembers()
  }

  const addButton = (
    <Button onClick={openCreateModal} disabled={atSeatLimit}>
      + Add Team Member
    </Button>
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col min-h-0 gap-4">
        <div className="flex items-center justify-between flex-shrink-0">
          <p className="text-sm text-muted-foreground">
            {seatsUsed}/{seatLimit} seats used
          </p>
          {atSeatLimit && seatUpgradeMessage ? (
            <Tooltip>
              <TooltipTrigger render={addButton} />
              <TooltipContent side="left" className="max-w-xs">
                {seatUpgradeMessage}
              </TooltipContent>
            </Tooltip>
          ) : (
            addButton
          )}
        </div>

        <MainPageCard className="overflow-hidden p-6">
          <MainPageCardScroll className="pr-2">
            {members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member) => {
                  const isSelf = member.id === currentUserId
                  return (
                    <div
                      key={member.id}
                      className="flex flex-col items-stretch gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/30 max-md:gap-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <Avatar className="h-11 w-11 shrink-0">
                          <AvatarImage src={member.avatar_url || undefined} alt={member.name} />
                          <AvatarFallback>
                            {member.name
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {member.name}
                            {isSelf && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {member.email || 'No email on file'}
                          </div>
                          {member.crew_name && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Assigned to {member.crew_name}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2 max-md:w-full max-md:[&_button]:min-h-11">
                        <Badge variant="outline">{roleLabel(member.role)}</Badge>
                        <Badge variant={member.status === 'Active' ? 'default' : 'secondary'}>
                          {member.status}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => openEditModal(member)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={isSelf}
                          onClick={() => {
                            setMemberToDelete(member)
                            setIsDeleteOpen(true)
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-muted-foreground mb-4">No team members yet.</p>
                {!atSeatLimit && (
                  <Button onClick={openCreateModal}>+ Add First Team Member</Button>
                )}
              </div>
            )}
          </MainPageCardScroll>
        </MainPageCard>

        <Dialog
          open={isModalOpen}
          onOpenChange={(open) => {
            if (!open) resetForm()
            setIsModalOpen(open)
          }}
        >
          <DialogContent className="!max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingMember ? 'Edit Team Member' : 'Add Team Member'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label>Display Name *</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="John Doe"
                  autoComplete="name"
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@company.com"
                  disabled={Boolean(editingMember)}
                  autoComplete={editingMember ? 'off' : 'email'}
                />
              </div>

              <div>
                <Label>
                  Password {editingMember ? '(leave blank to keep current)' : '(optional)'}
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={
                    editingMember
                      ? 'Leave blank to keep current password'
                      : 'Leave blank to send an email invite'
                  }
                  autoComplete="new-password"
                />
                {!editingMember && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave blank to email an invite link. Set a password to create the account
                    directly.
                  </p>
                )}
              </div>

              <div>
                <Label>Role</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      role: (value ?? 'team_member') as TeamMemberForm['role'],
                    })
                  }
                  disabled={editingMember?.id === currentUserId}
                >
                  <SelectTrigger className="mt-1 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team_member">Team Member</SelectItem>
                    <SelectItem value="company_admin">Company Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ImageAttachmentField
                label="Profile photo"
                imageSrc={photoPreview}
                fileName={
                  photoFile?.name ||
                  (photoPreview && !avatarRemoved ? 'Current photo' : null)
                }
                description={
                  photoFile
                    ? 'New photo will be saved when you save'
                    : editingMember?.avatar_url && !avatarRemoved
                      ? 'Current profile photo'
                      : undefined
                }
                isUploading={isSaving && Boolean(photoFile)}
                onFileSelect={handlePhotoFileSelect}
                onRemove={handlePhotoRemove}
                idleTitle="Upload profile photo"
                idleDescription="Shown on the dashboard and in crew views"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving && <Loader2 className="size-4 animate-spin" />}
                {isSaving
                  ? editingMember
                    ? 'Saving...'
                    : 'Adding...'
                  : editingMember
                    ? 'Save Changes'
                    : form.password.trim()
                      ? 'Create Account'
                      : 'Send Invite'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogContent className="!max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove this team member?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This will permanently delete <strong>{memberToDelete?.name}</strong>, remove them
              from any crews, and revoke their login access.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteOpen(false)
                  setMemberToDelete(null)
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete()}>
                Yes, Remove
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}