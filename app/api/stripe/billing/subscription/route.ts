import { NextResponse } from 'next/server'
import {
  getCompanyPlatformSubscriptionDetails,
  getStaffCompanyAdminId,
  performPlatformSubscriptionAction,
  type PlatformSubscriptionAction,
} from '@/lib/platform-subscription-server'

const ACTIONS: PlatformSubscriptionAction[] = ['cancel', 'resume', 'pause', 'unpause']

export async function GET() {
  try {
    const companyId = await getStaffCompanyAdminId()
    if (!companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const details = await getCompanyPlatformSubscriptionDetails(companyId)
    if (!details) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    return NextResponse.json({ details })
  } catch (error: unknown) {
    console.error('subscription details error:', error)
    const message = error instanceof Error ? error.message : 'Failed to load subscription'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const companyId = await getStaffCompanyAdminId()
    if (!companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const action = body.action as PlatformSubscriptionAction
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const result = await performPlatformSubscriptionAction(companyId, action)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ details: result.details })
  } catch (error: unknown) {
    console.error('subscription action error:', error)
    const message = error instanceof Error ? error.message : 'Subscription update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}