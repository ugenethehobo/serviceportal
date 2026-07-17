'use client'

import { Suspense, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createCrew, updateCrew, deleteCrew, getCrewsPageDataAction } from '@/app/action'
import { getCrewLimitMessage, type PlanEntitlements } from '@/lib/platform-entitlements'
import { DispatchBoard } from '@/components/dashboard/dispatch-board'
import { SoloTeamView } from '@/components/dashboard/solo-team-view'
import { TeamMembersPanel } from '@/components/dashboard/team-members-panel'
import { TeamPageSkeleton } from '@/components/dashboard/team-page-client'
import { WorkspaceSectionShell } from '@/components/dashboard/workspace-section-shell'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { MainPageCardScroll } from '@/components/ui/main-page-card'
import { PageLoadingSkeleton } from '@/components/ui/page-loading-skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import {
  CREWS_SECTION_GROUPS,
  getCrewsWorkspaceDefaultSection,
  getCrewsWorkspacePageCopy,
  getCrewsWorkspaceSections,
} from '@/lib/crews-workspace'
import { getCrewTerminology } from '@/lib/crew-terminology'
import { MOBILE_FULL_WIDTH_BUTTON_CLASS } from '@/lib/mobile-layout'

interface Profile {
  id: string
  full_name: string
  avatar_url?: string | null
}

interface CrewWithMembers {
  id: string
  name: string
  created_at: string
  crew_lead_id?: string | null
  members: Profile[]
}

type CrewsPageClientProps = {
  initialCrews: CrewWithMembers[]
  initialAvailableMembers: Profile[]
  initialIsSoloBusiness: boolean
  initialEntitlements: PlanEntitlements | null
  /** Crew lead (non-admin): only Dispatch section (P4). */
  initialLeadOnly?: boolean
  /** Company-customized plural label (default "Crews"). */
  initialCrewLabel?: string | null
}

function CrewsPageContent({
  initialCrews,
  initialAvailableMembers,
  initialIsSoloBusiness,
  initialEntitlements,
  initialLeadOnly = false,
  initialCrewLabel = null,
}: CrewsPageClientProps) {
  const supabase = createClient()
  const [crews, setCrews] = useState<CrewWithMembers[]>(initialCrews)
  const [availableMembers, setAvailableMembers] = useState<Profile[]>(initialAvailableMembers)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingCrew, setEditingCrew] = useState<CrewWithMembers | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [newCrewName, setNewCrewName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')

  const [editCrewName, setEditCrewName] = useState('')
  const [editSelectedLeadId, setEditSelectedLeadId] = useState<string>('')
  const [editMembersToAdd, setEditMembersToAdd] = useState<string[]>([])
  const [editMembersToRemove, setEditMembersToRemove] = useState<string[]>([])
  const [editAvailableMembers, setEditAvailableMembers] = useState<Profile[]>([])

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [crewToDelete, setCrewToDelete] = useState<CrewWithMembers | null>(null)
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(initialEntitlements)
  const [isSoloBusiness, setIsSoloBusiness] = useState(initialIsSoloBusiness)
  const [crewLabel, setCrewLabel] = useState(initialCrewLabel)
  const terms = useMemo(() => getCrewTerminology(crewLabel), [crewLabel])

  const crewLimit = entitlements?.crewLimit ?? null
  const atCrewLimit = crewLimit !== null && crews.length >= crewLimit
  const crewUpgradeMessage =
    entitlements && crewLimit !== null && atCrewLimit
      ? getCrewLimitMessage(entitlements.plan, crewLimit)
      : null

  const sections = useMemo(() => {
    const all = getCrewsWorkspaceSections(isSoloBusiness, crewLabel).map((section) => ({
      id: section.id,
      label: section.label,
      description: section.description,
      icon: section.icon,
      groupId: section.group,
    }))
    if (initialLeadOnly) {
      return all.filter((s) => s.id === 'dispatch')
    }
    return all
  }, [isSoloBusiness, initialLeadOnly, crewLabel])

  const pageCopy = initialLeadOnly
    ? {
        title: 'Dispatch',
        description: `Pull unassigned jobs onto your ${terms.singularLower}, release work you cannot cover, and open jobs to add helpers.`,
      }
    : getCrewsWorkspacePageCopy(isSoloBusiness, crewLabel)
  const defaultSectionId = initialLeadOnly
    ? 'dispatch'
    : getCrewsWorkspaceDefaultSection(isSoloBusiness)

  const fetchData = async () => {
    const result = await getCrewsPageDataAction()
    if (!result.success) {
      console.error('Error fetching crews:', result.error)
      return
    }

    setCrews(result.data.crews)
    setAvailableMembers(result.data.availableMembers)
    setIsSoloBusiness(result.data.isSoloBusiness)
    setEntitlements(result.data.entitlements)
    if (result.data.crewLabel !== undefined) {
      setCrewLabel(result.data.crewLabel)
    }
  }

  const openEditModal = (crew: CrewWithMembers) => {
    setEditingCrew(crew)
    setEditCrewName(crew.name)
    setEditSelectedLeadId(crew.crew_lead_id || '')
    setEditMembersToAdd([])
    setEditMembersToRemove([])
    setEditAvailableMembers(availableMembers)
    setIsEditModalOpen(true)
  }

  const handleCreateCrew = async () => {
    if (!newCrewName.trim()) {
      toast.error(`${terms.singular} name is required`)
      return
    }

    setIsCreating(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    const result = await createCrew({
      name: newCrewName.trim(),
      memberIds: selectedMembers,
      crewLeadId: selectedLeadId || undefined,
      companyId: profile!.company_id,
    })

    if (result.success) {
      setNewCrewName('')
      setSelectedMembers([])
      setSelectedLeadId('')
      setIsAddModalOpen(false)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to create crew')
    }
    setIsCreating(false)
  }

  const handleUpdateCrew = async () => {
    if (!editingCrew) return
    setIsCreating(true)

    const result = await updateCrew({
      crewId: editingCrew.id,
      name: editCrewName.trim(),
      crewLeadId: editSelectedLeadId || null,
      membersToAdd: editMembersToAdd,
      membersToRemove: editMembersToRemove,
    })

    if (result.success) {
      setIsEditModalOpen(false)
      setEditingCrew(null)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to update crew')
    }
    setIsCreating(false)
  }

  const handleDeleteCrew = async () => {
    if (!crewToDelete) return

    const result = await deleteCrew(crewToDelete.id)

    if (result.success) {
      setIsDeleteConfirmOpen(false)
      setIsEditModalOpen(false)
      setCrewToDelete(null)
      setEditingCrew(null)
      await fetchData()
    } else {
      toast.error(result.error || 'Failed to delete crew')
    }
  }

  const addCrewButton = (
    <Button
      onClick={() => setIsAddModalOpen(true)}
      disabled={atCrewLimit}
      className={MOBILE_FULL_WIDTH_BUTTON_CLASS}
    >
      + Add {terms.singular}
    </Button>
  )

  return (
    <>
      <WorkspaceSectionShell
        title={pageCopy.title}
        description={pageCopy.description}
        sections={sections}
        groups={CREWS_SECTION_GROUPS.map((g) => ({ id: g.id, label: g.label }))}
        defaultSectionId={defaultSectionId}
        sectionActions={(activeSectionId) => {
          if (initialLeadOnly || activeSectionId !== 'crews') return null
          return (
            <TooltipProvider>
              {atCrewLimit && crewUpgradeMessage ? (
                <Tooltip>
                  <TooltipTrigger render={addCrewButton} />
                  <TooltipContent side="left" className="max-w-xs">
                    {crewUpgradeMessage}
                  </TooltipContent>
                </Tooltip>
              ) : (
                addCrewButton
              )}
            </TooltipProvider>
          )
        }}
      >
        {(activeSectionId) => {
          if (activeSectionId === 'my-day') {
            return (
              <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
                <SoloTeamView embedded />
              </div>
            )
          }

          if (activeSectionId === 'schedule' || activeSectionId === 'dispatch') {
            return (
              <MainPageCardScroll contentClassName="max-w-none p-4 sm:p-6">
                <DispatchBoard embedded />
              </MainPageCardScroll>
            )
          }

          if (activeSectionId === 'team') {
            return (
              <div className="flex h-full min-h-0 flex-col p-4 sm:p-6">
                <TeamMembersPanel />
              </div>
            )
          }

          // crews
          return (
            <MainPageCardScroll contentClassName="max-w-none p-4 sm:p-6">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Organize team members into field {terms.pluralLower}. Designate a lead so they
                  can pull jobs from Unassigned and add multi-tech helpers.
                  {crewLimit !== null ? (
                    <span className="ml-1">
                      · {crews.length}/{crewLimit} used
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {crews.length > 0 ? (
                  crews.map((crew) => {
                    const lead = crew.members.find((m) => m.id === crew.crew_lead_id)
                    return (
                      <div
                        key={crew.id}
                        onClick={() => openEditModal(crew)}
                        className="cursor-pointer rounded-lg border p-5 transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <h3 className="text-lg font-semibold">{crew.name}</h3>
                          {lead ? (
                            <Badge className="max-md:text-[10px]">
                              Lead: {lead.full_name.split(' ')[0]}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="max-md:text-[10px]">
                              No lead
                            </Badge>
                          )}
                        </div>

                        <div className="mt-4">
                          <p className="mb-2 text-sm font-medium text-muted-foreground">
                            Members ({crew.members.length})
                          </p>
                          {crew.members.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {crew.members.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={member.avatar_url || undefined} />
                                    <AvatarFallback className="text-xs">
                                      {member.full_name
                                        .split(' ')
                                        .map((n) => n[0])
                                        .join('')}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{member.full_name}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm italic text-muted-foreground">No members</p>
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="col-span-full py-12 text-center text-muted-foreground">
                    No {terms.pluralLower} yet. Create your first {terms.singularLower}.
                  </div>
                )}
              </div>
            </MainPageCardScroll>
          )
        }}
      </WorkspaceSectionShell>

      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Create New {terms.singular}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>{terms.singular} Name *</Label>
              <Input
                value={newCrewName}
                onChange={(e) => setNewCrewName(e.target.value)}
                placeholder={`Morning ${terms.singular}`}
              />
            </div>

            <div>
              <Label>Select Team Members</Label>
              <ScrollArea className="mt-2 max-h-52 rounded-md border" viewportClassName="scroll-fade">
                <div className="space-y-1 p-2">
                  {availableMembers.length > 0 ? (
                    availableMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded p-2 hover:bg-muted"
                      >
                        <label className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={selectedMembers.includes(member.id)}
                            onCheckedChange={() =>
                              setSelectedMembers((prev) =>
                                prev.includes(member.id)
                                  ? prev.filter((id) => id !== member.id)
                                  : [...prev, member.id]
                              )
                            }
                          />
                          <span>{member.full_name}</span>
                        </label>

                        {selectedMembers.includes(member.id) && (
                          <Button
                            variant={selectedLeadId === member.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedLeadId(member.id)}
                            className="h-7 text-xs"
                          >
                            {selectedLeadId === member.id ? 'Lead' : 'Make Lead'}
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="p-2 text-sm text-muted-foreground">
                      No available team members.
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCrew} disabled={isCreating || !newCrewName.trim()}>
              {isCreating ? 'Creating...' : `Create ${terms.singular}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit {terms.singular}: {editingCrew?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div>
              <Label>{terms.singular} Name</Label>
              <Input value={editCrewName} onChange={(e) => setEditCrewName(e.target.value)} />
            </div>

            <div>
              <Label>Current Members</Label>
              <ScrollArea className="mt-2 max-h-40 rounded border" viewportClassName="scroll-fade">
                <div className="space-y-2 p-2">
                  {editingCrew?.members.length ? (
                    editingCrew.members.map((member) => (
                      <div key={member.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback>{member.full_name[0]}</AvatarFallback>
                          </Avatar>
                          <span>{member.full_name}</span>
                          {member.id === editingCrew.crew_lead_id && (
                            <Badge variant="secondary" className="text-xs">
                              Lead
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const memberToRemove = member
                            setEditMembersToRemove((prev) => [...prev, memberToRemove.id])
                            setEditingCrew((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    members: prev.members.filter(
                                      (m) => m.id !== memberToRemove.id
                                    ),
                                  }
                                : null
                            )
                            setEditAvailableMembers((prev) => {
                              const alreadyExists = prev.some((m) => m.id === memberToRemove.id)
                              return alreadyExists ? prev : [...prev, memberToRemove]
                            })
                            if (editSelectedLeadId === memberToRemove.id) {
                              setEditSelectedLeadId('')
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No members</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div>
              <Label>Add Team Members</Label>
              <ScrollArea className="mt-2 max-h-40 rounded border" viewportClassName="scroll-fade">
                <div className="space-y-1 p-2">
                  {editAvailableMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted"
                    >
                      <Checkbox
                        checked={editMembersToAdd.includes(member.id)}
                        onCheckedChange={() =>
                          setEditMembersToAdd((prev) =>
                            prev.includes(member.id)
                              ? prev.filter((id) => id !== member.id)
                              : [...prev, member.id]
                          )
                        }
                      />
                      <span>{member.full_name}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div>
              <Label>{terms.singular} Lead</Label>
              <Select
                value={editSelectedLeadId || '__none__'}
                onValueChange={(value) =>
                  setEditSelectedLeadId(value === '__none__' ? '' : (value ?? ''))
                }
              >
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No Lead</SelectItem>
                  {editingCrew?.members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-4">
            <Button
              variant="destructive"
              onClick={() => {
                setCrewToDelete(editingCrew)
                setIsDeleteConfirmOpen(true)
              }}
            >
              Delete {terms.singular}
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateCrew} disabled={isCreating}>
                {isCreating ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this {terms.singularLower}?</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete <strong>{crewToDelete?.name}</strong>? All members
            will be removed from the {terms.singularLower}.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                setCrewToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCrew}>
              Yes, Delete {terms.singular}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CrewsPageClient(props: CrewsPageClientProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-0 flex-col p-6">
          <PageLoadingSkeleton />
        </div>
      }
    >
      <CrewsPageContent {...props} />
    </Suspense>
  )
}
