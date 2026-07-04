'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteUserCompletely } from '@/app/action'
import { createCompanyUser } from '@/app/action'
import { getCompanyData } from '@/app/action'
import { updateCompanyUser } from '@/app/action'

interface User {
  id: string
  name: string
  email: string
  role: string
  status: string
  avatar_url?: string | null
}

interface Company {
  id: string
  name: string
  subscription_plan?: string | null
  subscription_status?: string | null
  seat_limit?: number | null
  trial_ends_at?: string | null
}

export default function CompanyUsersPage() {
  const params = useParams()
  const companyId = params.id as string
  const supabase = createClient()

  const [company, setCompany] = useState<Company | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)



  const fetchData = async () => {
    try {
      const { company: companyData, users: usersData } = await getCompanyData(companyId)

      if (companyData) setCompany(companyData)
      setUsers(usersData || [])
    } catch (error) {
      console.error('Error fetching company data:', error)
    }
  }

  // Delete confirmation state
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  const handleDeleteUser = async () => {
    if (!userToDelete || !company) {
      setIsDeleteConfirmOpen(false)
      setUserToDelete(null)
      return
    }

    try {
      const result = await deleteUserCompletely(userToDelete.id, userToDelete.avatar_url)

      if (result.success) {
        // Refresh both company and users using your existing function
        await fetchData()

        setIsDeleteConfirmOpen(false)
        setUserToDelete(null)
        alert('User and all associated data deleted successfully.')
      } else {
        alert(result.error || 'Failed to delete user')
        setIsDeleteConfirmOpen(false)
        setUserToDelete(null)
      }
    } catch (error: any) {
      console.error('Delete error:', error)
      alert(error.message || 'An unexpected error occurred')
      setIsDeleteConfirmOpen(false)
      setUserToDelete(null)
    }
  }

  useEffect(() => {
    if (companyId) fetchData()
  }, [companyId])

  // Prefill form when editing a user
useEffect(() => {
  if (isAddUserModalOpen && editingUser) {
    setNewUser({
      displayName: editingUser.name || '',
      email: editingUser.email || '',
      password: '',           // Never prefill password for security
      role: editingUser.role || 'team_member',
    })
    setPhotoPreview(editingUser.avatar_url || null)
    setUserPhotoFile(null)
  } else if (!isAddUserModalOpen) {
    // Reset form when modal is closed
    setNewUser({ displayName: '', email: '', password: '', role: 'team_member' })
    setUserPhotoFile(null)
    setPhotoPreview(null)
    setEditingUser(null)
  }
}, [isAddUserModalOpen, editingUser])

  // Add User form state
  const [newUser, setNewUser] = useState({
    displayName: '',
    email: '',
    password: '',
    role: 'team_member',
  })
  const [userPhotoFile, setUserPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)


  // Handle photo preview
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUserPhotoFile(file)
      const previewUrl = URL.createObjectURL(file)
      setPhotoPreview(previewUrl)
    }
  }

  const handleSaveUser = async () => {
    if (!newUser.displayName || !newUser.email || !company) {
      alert('Display name and email are required')
      return
    }

    setIsCreatingUser(true)

    try {
      let avatarUrl = editingUser?.avatar_url || null

      if (userPhotoFile) {
        const fileExt = userPhotoFile.name.split('.').pop()
        const fileName = `user-${Date.now()}.${fileExt}`

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('user-avatars')
          .upload(fileName, userPhotoFile)

        if (uploadError) throw uploadError

        const { data: publicUrl } = supabase.storage
          .from('user-avatars')
          .getPublicUrl(uploadData.path)

        avatarUrl = publicUrl.publicUrl
      }

      if (editingUser) {
        // === EDIT MODE ===
        const result = await updateCompanyUser({
          userId: editingUser.id,
          displayName: newUser.displayName,
          password: newUser.password || undefined,
          role: newUser.role,
          avatarUrl,
        })

        if (!result.success) throw new Error(result.error)
      } else {
        // === ADD MODE ===
        if (!newUser.password) {
          alert('Password is required when creating a new user')
          setIsCreatingUser(false)
          return
        }

        const result = await createCompanyUser({
          email: newUser.email,
          password: newUser.password,
          displayName: newUser.displayName,
          role: newUser.role,
          avatarUrl,
          companyId: company.id,
        })

        if (!result.success) throw new Error(result.error)
      }

      await fetchData()
      setIsAddUserModalOpen(false)
      setEditingUser(null)
      setNewUser({ displayName: '', email: '', password: '', role: 'team_member' })
      setUserPhotoFile(null)
      setPhotoPreview(null)

      alert(editingUser ? 'User updated successfully!' : 'User created successfully!')

    } catch (error: any) {
      console.error('Error saving user:', error)
      alert(error.message || 'Failed to save user')
    } finally {
      setIsCreatingUser(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/admin">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{company?.name || 'Loading...'}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{company?.name}</h1>
          <p className="text-muted-foreground">User Management</p>
          {company && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Badge variant="outline">{company.subscription_plan || 'trial'}</Badge>
              <span>
                Seats {users.filter((u) => u.role === 'company_admin' || u.role === 'team_member').length}/
                {company.seat_limit ?? 10}
              </span>
              {company.trial_ends_at && (
                <span>Trial ends {new Date(company.trial_ends_at).toLocaleDateString()}</span>
              )}
            </div>
          )}
        </div>
        <Button onClick={() => setIsAddUserModalOpen(true)}>+ Add User</Button>
      </div>

      {/* Users List */}
      <div className="space-y-4">
      {users.length > 0 ? (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/30 transition-colors"
            >
              {/* Left side: Avatar + Name + Email */}
              <div className="flex items-center gap-4 min-w-0">
                <Avatar className="h-11 w-11 flex-shrink-0">
                  {user.avatar_url ? (
                    <AvatarImage src={user.avatar_url} alt={user.name} />
                  ) : (
                    <AvatarImage
                      src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
                      alt={user.name}
                    />
                  )}
                  <AvatarFallback>
                    {user.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-base truncate">{user.name}</div>

                  {user.email ? (
                    <div className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      No email on file
                    </div>
                  )}
                </div>
              </div>

              {/* Right side: Status + Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <Badge variant="outline">{user.role}</Badge>
                <Badge
                  variant={user.status === 'Active' ? 'default' : 'secondary'}
                >
                  {user.status}
                </Badge>

                <div className="flex gap-1 ml-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingUser(user)
                    setIsAddUserModalOpen(true)
                  }}
                >
                  Edit
                </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      setUserToDelete(user)
                      setIsDeleteConfirmOpen(true)
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg">
          <p className="text-muted-foreground mb-4">No users added yet for this company.</p>
          <Button onClick={() => setIsAddUserModalOpen(true)}>+ Add First User</Button>
        </div>
      )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="!max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this user?</DialogTitle>
          </DialogHeader>
          <p>
            This will permanently delete <strong>{userToDelete?.name}</strong>,
            their profile photo, and remove them from authentication.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteConfirmOpen(false)
                setUserToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteUser}
            >
              Yes, Delete User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add / Edit User Modal */}
      <Dialog open={isAddUserModalOpen} onOpenChange={(open) => {
  if (!open) {
    setEditingUser(null)
    setNewUser({ displayName: '', email: '', password: '', role: 'team_member' })
    setUserPhotoFile(null)
    setPhotoPreview(null)
  }
  setIsAddUserModalOpen(open)
}}>
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Edit User' : 'Add New User'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
          {/* Display Name */}
          <div>
            <Label>Display Name *</Label>
            <Input
              value={newUser.displayName}
              onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
              placeholder="John Doe"
              autoComplete="name"
            />
          </div>

          {/* Email */}
          <div>
            <Label>Email *</Label>
            <Input
              type="email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              placeholder="user@company.com"
              disabled={!!editingUser}
              autoComplete={editingUser ? "off" : "email"}
            />
          </div>

          {/* Password */}
          <div>
            <Label>
              Password {editingUser ? "(leave blank to keep current)" : "*"}
            </Label>
            <Input
              type="password"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              placeholder={editingUser ? "Leave blank to keep current password" : "••••••••"}
              autoComplete={editingUser ? "new-password" : "new-password"}
            />
          </div>

            {/* Role */}
            <div>
              <Label>Role</Label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full border rounded-md px-3 py-2 bg-background"
              >
                <option value="team_member">Team Member</option>
                <option value="company_admin">Company Admin</option>
              </select>
            </div>

            {/* Profile Photo with Preview */}
            <div>
              <Label>Profile Photo</Label>
              <Input type="file" accept="image/*" onChange={handlePhotoChange} />
              {photoPreview ? (
                <div className="mt-3 flex justify-center">
                  <img src={photoPreview} alt="Preview" className="h-20 w-20 rounded-full object-cover border" />
                </div>
              ) : editingUser?.avatar_url ? (
                <div className="mt-3 flex justify-center">
                  <img src={editingUser.avatar_url} alt="Current" className="h-20 w-20 rounded-full object-cover border" />
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsAddUserModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUser} disabled={isCreatingUser}>
              {isCreatingUser
                ? (editingUser ? "Saving..." : "Creating...")
                : (editingUser ? "Save Changes" : "Create User")
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
