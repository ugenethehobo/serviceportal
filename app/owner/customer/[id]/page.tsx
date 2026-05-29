import { createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { deleteCompanyAsOwner } from '../../actions'
import { Button } from '@/components/ui/button'

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Use admin client so owners can view any customer's details
  const supabase = createAdminClient()

  // Try to load from onboarding_intakes (best source of full data)
  const { data: intake } = await supabase
    .from('onboarding_intakes')
    .select('*')
    .eq('stripe_customer_id', id)
    .order('completed_at', { ascending: false })
    .limit(1)
    .single()

  // Also try to load company + subscription
  const { data: company } = await supabase
    .from('companies')
    .select('*, subscriptions(*)')
    .eq('id', id)
    .single()

  const intakeData = intake?.intake_data || {}

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight mb-2">
        {company?.name || intakeData.company_name || 'Customer Details'}
      </h1>
      <p className="text-muted-foreground mb-8">Full customer record and onboarding data</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
          </CardHeader>
          <CardContent>
            {company ? (
              <div>
                <div className="text-2xl font-semibold mb-1">{company.subscription_status}</div>
                {company.subscriptions?.[0] && (
                  <div className="text-sm text-muted-foreground">
                    Plan: {company.subscriptions[0].plan} • Renews: {new Date(company.subscriptions[0].current_period_end).toLocaleDateString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground">No subscription record found (migration may not be applied)</div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>Onboarding Data</CardTitle>
          </CardHeader>
          <CardContent>
            {intake ? (
              <pre className="text-xs bg-muted p-4 rounded-none overflow-auto max-h-[400px]">
                {JSON.stringify(intakeData, null, 2)}
              </pre>
            ) : (
              <div className="text-muted-foreground">No detailed intake data found for this customer.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 text-xs text-muted-foreground">
        This page will become much richer once the full multi-tenant migration is applied and more data is being captured.
      </div>

      {/* Admin Delete Section */}
      <div className="mt-12 border-t pt-8">
        <div className="text-sm font-medium text-destructive mb-2">Danger Zone</div>
        <form action={async () => {
          'use server'
          await deleteCompanyAsOwner(id)
        }}>
          <Button
            type="submit"
            variant="destructive"
            className="rounded-none"
          >
            Admin Delete This Company
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Permanently removes the company, all related data, Stripe customer, and the user account. For testing/cleanup only.
        </p>
      </div>
    </div>
  )
}
