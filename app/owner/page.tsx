import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { OwnerCustomersTable } from './OwnerCustomersTable'

export default async function OwnerDashboard() {
  // Use admin client so the owner can see *all* companies regardless of RLS
  const supabase = createAdminClient()

  // Use the new companies table (migration has been applied)
  const { data: companies } = await supabase
    .from('companies')
    .select(`
      id,
      name,
      subscription_status,
      created_at,
      owner_user_id,
      stripe_customer_id,
      trial_clients_used,
      trial_clients_limit,
      subscriptions ( status, plan, current_period_end )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  const customers = (companies || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    subscription_status: c.subscription_status,
    created_at: c.created_at,
    stripe_customer_id: c.stripe_customer_id,
    subscription: c.subscriptions?.[0] || null,
    trial_clients_used: c.trial_clients_used,
    trial_clients_limit: c.trial_clients_limit,
  }))

  const totalCustomers = customers.length
  const recentSignups = customers.filter((c: any) => {
    const date = new Date(c.created_at)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    return date > thirtyDaysAgo
  }).length

  const activeOrTrialing = customers.filter((c: any) => ['active', 'trialing'].includes(c.subscription_status)).length

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Owner Dashboard</h1>
        <p className="text-muted-foreground">Overview of customers, subscriptions, and platform activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tracking-tight">{totalCustomers}</div>
          </CardContent>
        </Card>

        <Card className="rounded-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Signups (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tracking-tight">{recentSignups}</div>
          </CardContent>
        </Card>

        <Card className="rounded-none">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Active / Trialing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-semibold tracking-tight text-green-600">{activeOrTrialing}</div>
          </CardContent>
        </Card>
      </div>

      <OwnerCustomersTable customers={customers} />

      <div className="mt-8 text-xs text-muted-foreground">
        Production owner console — powered by the multi-tenant schema.
      </div>
    </div>
  )
}
