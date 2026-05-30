'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { deleteCompanyAsOwner } from './actions'

interface Customer {
  id: string
  name: string
  subscription_status: string | null
  created_at: string
  subscription?: {
    plan: string | null
  } | null
  trial_clients_used?: number | null
  trial_clients_limit?: number | null
}

interface OwnerCustomersTableProps {
  customers: Customer[]
}

export function OwnerCustomersTable({ customers }: OwnerCustomersTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean
    companyId: string
    companyName: string
  }>({
    open: false,
    companyId: '',
    companyName: '',
  })
  const [isDeleting, setIsDeleting] = useState(false)

  const filteredCustomers = customers
    .filter((customer) => {
      const matchesSearch = customer.name?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesStatus = statusFilter === 'all' || customer.subscription_status === statusFilter
      return matchesSearch && matchesStatus
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const statusOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'trialing', label: 'Trialing' },
    { value: 'past_due', label: 'Past Due' },
    { value: 'canceled', label: 'Canceled' },
  ]

  const handleDeleteClick = (customer: Customer) => {
    setDeleteDialog({
      open: true,
      companyId: customer.id,
      companyName: customer.name || 'Unnamed Company',
    })
  }

  const handleConfirmDelete = async () => {
    if (!deleteDialog.companyId) return

    setIsDeleting(true)

    try {
      const result = await deleteCompanyAsOwner(deleteDialog.companyId)
      // The server action already does revalidatePath
      // We can close the dialog
      setDeleteDialog({ open: false, companyId: '', companyName: '' })
      alert(result.message || 'Company deleted successfully')
    } catch (error: any) {
      console.error('Delete failed:', error)
      alert(`Failed to delete: ${error.message || 'Unknown error'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Card className="rounded-none">
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <CardTitle>Customers</CardTitle>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Input
              placeholder="Search companies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:w-64 rounded-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-none px-3 py-2 text-sm bg-background"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredCustomers.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">No customers match your filters.</div>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-3 pr-4">Company</th>
                  <th className="py-3 pr-4">Subscription</th>
                  <th className="py-3 pr-4">Trial Usage</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">
                      {customer.name || 'Unnamed Company'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-none border ${
                        customer.subscription_status === 'active' ? 'border-green-600 text-green-600' :
                        customer.subscription_status === 'trialing' ? 'border-blue-600 text-blue-600' :
                        'border-gray-400 text-gray-500'
                      }`}>
                        {customer.subscription_status || 'unknown'}
                      </span>
                      {customer.subscription && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {customer.subscription.plan}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {customer.subscription_status === 'trialing' ? (
                        <>
                          {customer.trial_clients_used ?? 0} / {customer.trial_clients_limit ?? 3}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {new Date(customer.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 text-sm">
                        <a href={`/owner/customer/${customer.id}`} className="text-primary hover:underline whitespace-nowrap">
                          View
                        </a>
                        <a href={`/dashboard`} className="text-muted-foreground hover:underline whitespace-nowrap">
                          Impersonate
                        </a>
                        <button
                          onClick={() => handleDeleteClick(customer)}
                          className="text-red-600 hover:text-red-700 hover:underline text-left whitespace-nowrap"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ open: false, companyId: '', companyName: '' })
        }}
        title="Delete Company?"
        description={`This will permanently delete "${deleteDialog.companyName}" and all associated data (clients, jobs, settings, subscriptions, user account, etc.). This action cannot be undone.`}
        confirmLabel={isDeleting ? "Deleting..." : "Delete Company"}
        destructive
        onConfirm={handleConfirmDelete}
        loading={isDeleting}
      />
    </Card>
  )
}
