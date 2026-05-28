'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                    <td className="py-3 flex gap-3 text-sm">
                      <a href={`/owner/customer/${customer.id}`} className="text-primary hover:underline">
                        View Details
                      </a>
                      <a href={`/dashboard`} className="text-muted-foreground hover:underline">
                        Impersonate
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
