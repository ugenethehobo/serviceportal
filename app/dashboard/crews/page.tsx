'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createCrew, updateCrew, deleteCrew, getCompanySubscriptionAccessAction } from '@/app/action'
import { CREW_ASSIGNABLE_ROLES } from '@/lib/company-operations'
import { getCrewLimitMessage, type PlanEntitlements } from '@/lib/platform-entitlements'
import { SoloTeamView } from '@/components/dashboard/solo-team-view'
import { TeamMembersPanel } from '@/components/dashboard/team-members-panel'
import { TeamPageSkeleton } from '@/components/dashboard/team-page-client'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { X } from 'lucide-react'

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

export default function CrewsPage() {
  const supabase = createClient()
  const [crews, setCrews] = useState<CrewWithMembers[]>([])
  const [availableMembers, setAvailableMembers] = useState<Profile[]>([])
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingCrew, setEditingCrew] = useState<CrewWithMembers | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Add Crew form
  const [newCrewName, setNewCrewName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')

  // Edit Crew form
  const [editCrewName, setEditCrewName] = useState('')
  const [editSelectedLeadId, setEditSelectedLeadId] = useState<string>('')
  const [editMembersToAdd, setEditMembersToAdd] = useState<string[]>([])
  const [editMembersToRemove, setEditMembersToRemove] = useState<string[]>([])
  // Edit Crew - local available members (for real-time updates)
  const [editAvailableMembers, setEditAvailableMembers] = useState<Profile[]>([])

  // Delete confirmation
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [crewToDelete, setCrewToDelete] = useState<CrewWithMembers | null>(null)
  const [entitlements, setEntitlements] = useState<PlanEntitlements | null>(null)
  const [isSoloBusiness, setIsSoloBusiness] = useState(false)
  const [modeLoaded, setModeLoaded] = useState(false)
  const [activeTab, setActiveTab] = useState('crews')

  const crewLimit = entitlements?.crewLimit ?? null
  const atCrewLimit = crewLimit !== null && crews.length >= crewLimit
  const crewUpgradeMessage =
    entitlements && crewLimit !== null && atCrewLimit
      ? getCrewLimitMessage(entitlements.plan, crewLimit)
      : null

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (!profile?.company_id) return

    const { data: crewsData } = await supabase
      .from('crews')
      .select(`
        *,
        profiles!crew_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false })

    const formattedCrews: CrewWithMembers[] = crewsData?.map((crew: any) => ({
      id: crew.id,
      name: crew.name,
      created_at: crew.created_at,
      crew_lead_id: crew.crew_lead_id,
      members: crew.profiles || [],
    })) || []

    setCrews(formattedCrews)

    const { data: membersData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('company_id', profile.company_id)
      .in('role', CREW_ASSIGNABLE_ROLES)
      .is('crew_id', null)

    setAvailableMembers(membersData || [])
  }

  useEffect(() => {
    void (async () => {
      const accessResult = await getCompanySubscriptionAccessAction()
      if (accessResult.success) {
        setEntitlements(accessResult.entitlements)
        setIsSoloBusiness(accessResult.isSoloBusiness)
        if (!accessResult.isSoloBusiness) {
          await fetchData()
        }
      }
      setModeLoaded(true)
    })()
  }, [])

  const openEditModal = (crew: CrewWithMembers) => {
    setEditingCrew(crew)
    setEditCrewName(crew.name)
    setEditSelectedLeadId(crew.crew_lead_id || '')
    setEditMembersToAdd([])
    setEditMembersToRemove([])

    // Initialize available members for this edit session
    setEditAvailableMembers(availableMembers)

    setIsEditModalOpen(true)
  }

  const handleCreateCrew = async () => {
    if (!newCrewName.trim()) {
      alert('Crew name is required')
      return
    }

    setIsCreating(true)

    const { data: { user } } = await supabase.auth.getUser()
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
      alert(result.error || 'Failed to create crew')
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
      alert(result.error || 'Failed to update crew')
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
      alert(result.error || 'Failed to delete crew')
    }
  }

  const toggleEditMember = (memberId: string, isCurrentlyInCrew: boolean) => {
    if (isCurrentlyInCrew) {
      setEditMembersToRemove((prev) =>
        prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
      )
    } else {
      setEditMembersToAdd((prev) =>
        prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
      )
    }
  }

  const addCrewButton = (
    <Button onClick={() => setIsAddModalOpen(true)} disabled={atCrewLimit}>
      + Add Crew
    </Button>
  )

  if (!modeLoaded) {
    return (
      <div className="h-[100vh] flex flex-col min-h-0">
        <TeamPageSkeleton />
      </div>
    )
  }

  if (isSoloBusiness) {
    return (
      <div className="h-[100vh] flex flex-col min-h-0">
        <SoloTeamView />
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col h-[100vh]">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">Crews & Team</h1>
        <p className="text-muted-foreground">
          Manage field crews and team member accounts
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-1 flex-col min-h-0 gap-4"
      >
        <TabsList>
          <TabsTrigger value="crews">Crews</TabsTrigger>
          <TabsTrigger value="team">Team Members</TabsTrigger>
        </TabsList>

        <TabsContent value="crews" className="flex flex-1 flex-col min-h-0 mt-0 gap-4">
          <div className="flex items-center justify-between flex-shrink-0">
            <p className="text-sm text-muted-foreground">
              Organize team members into field crews
              {crewLimit !== null && (
                <span className="ml-1">
                  · {crews.length}/{crewLimit} used
                </span>
              )}
            </p>
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
          </div>

      <Card className="flex-1 flex flex-col overflow-hidden p-6 min-h-0">
        <ScrollArea className="flex-1 pr-2" viewportClassName="scroll-fade">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {crews.length > 0 ? (
              crews.map((crew) => {
                const lead = crew.members.find((m) => m.id === crew.crew_lead_id)
                return (
                  <div
                    key={crew.id}
                    onClick={() => openEditModal(crew)}
                    className="rounded-lg border p-5 cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-lg">{crew.name}</h3>
                      {lead && <Badge>Lead: {lead.full_name.split(' ')[0]}</Badge>}
                    </div>

                    <div className="mt-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        Members ({crew.members.length})
                      </p>
                      {crew.members.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {crew.members.map((member) => (
                            <div key={member.id} className="flex items-center gap-2 text-sm">
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={member.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">
                                  {member.full_name.split(' ').map((n) => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <span>{member.full_name}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No members</p>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                No crews yet. Create your first crew.
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
        </TabsContent>

        <TabsContent value="team" className="flex flex-1 flex-col min-h-0 mt-0">
          <TeamMembersPanel />
        </TabsContent>
      </Tabs>

      {/* Add Crew Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Crew</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Crew Name *</Label>
              <Input
                value={newCrewName}
                onChange={(e) => setNewCrewName(e.target.value)}
                placeholder="Morning Crew"
              />
            </div>

            <div>
              <Label>Select Team Members</Label>
              <ScrollArea className="mt-2 max-h-52 border rounded-md" viewportClassName="scroll-fade">
                <div className="p-2 space-y-1">
                {availableMembers.length > 0 ? (
                  availableMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(member.id)}
                          onChange={() =>
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
                          variant={selectedLeadId === member.id ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedLeadId(member.id)}
                          className="text-xs h-7"
                        >
                          {selectedLeadId === member.id ? "Lead" : "Make Lead"}
                        </Button>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground p-2">No available team members.</p>
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
              {isCreating ? 'Creating...' : 'Create Crew'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Crew Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="!max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Crew: {editingCrew?.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div>
              <Label>Crew Name</Label>
              <Input value={editCrewName} onChange={(e) => setEditCrewName(e.target.value)} />
            </div>

            {/* Current Members */}
            <div>
              <Label>Current Members</Label>
              <ScrollArea className="mt-2 max-h-40 border rounded" viewportClassName="scroll-fade">
                <div className="p-2 space-y-2">
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
                          <Badge variant="secondary" className="text-xs">Lead</Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const memberToRemove = member

                          // 1. Mark for database removal
                          setEditMembersToRemove((prev) => [...prev, memberToRemove.id])

                          // 2. Immediately remove from current members list (UI)
                          setEditingCrew((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  members: prev.members.filter((m) => m.id !== memberToRemove.id),
                                }
                              : null
                          )

                          // 3. Immediately add to available members list (so they can be re-added)
                          setEditAvailableMembers((prev) => {
                            const alreadyExists = prev.some((m) => m.id === memberToRemove.id)
                            return alreadyExists ? prev : [...prev, memberToRemove]
                          })

                          // 4. Clear lead if this person was the lead
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

            {/* Add New Members */}
            <div>
              <Label>Add Team Members</Label>
              <ScrollArea className="mt-2 max-h-40 border rounded" viewportClassName="scroll-fade">
                <div className="p-2 space-y-1">
                  {editAvailableMembers.map((member) => (
                    <label key={member.id} className="flex items-center gap-2 p-1 hover:bg-muted rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editMembersToAdd.includes(member.id)}
                        onChange={() =>
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

            {/* Change Crew Lead */}
            <div>
              <Label>Crew Lead</Label>
              <select
                value={editSelectedLeadId}
                onChange={(e) => setEditSelectedLeadId(e.target.value)}
                className="w-full border rounded p-2 mt-1"
              >
                <option value="">No Lead</option>
                {editingCrew?.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              variant="destructive"
              onClick={() => {
                setCrewToDelete(editingCrew)
                setIsDeleteConfirmOpen(true)
              }}
            >
              Delete Crew
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

      {/* Delete Confirmation */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this crew?</DialogTitle>
          </DialogHeader>
          <p>
            Are you sure you want to delete <strong>{crewToDelete?.name}</strong>?
            All members will be removed from the crew.
          </p>
          <div className="flex justify-end gap-2 mt-4">
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
              Yes, Delete Crew
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
