import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppBaseUrl } from '@/lib/url'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Generate link ourselves (bypasses Supabase rate limits)
    const appBaseUrl = getAppBaseUrl();
    console.log('[auth/resend-magic-link] Generating magic link with redirectTo base:', appBaseUrl);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${appBaseUrl}/auth/callback?next=/dashboard`,
      },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Failed to generate magic link for resend:', linkError)
      return NextResponse.json({ error: 'Failed to generate magic link' }, { status: 500 })
    }

    // Send via Resend
    try {
      const resend = new (await import('resend')).Resend(process.env.RESEND_API_KEY!)

      const { data, error: resendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'ServicePortal <onboarding@resend.dev>',
        to: email,
        subject: 'Set up your ServicePortal account',
        html: `
          <p>Here's your magic link to access your ServicePortal account:</p>
          <p><a href="${linkData.properties.action_link}">Access my account →</a></p>
        `,
      });

      if (resendError) {
        console.error('Resend send error (full):', resendError);
        return NextResponse.json({ 
          error: resendError.message || 'Failed to send email via Resend' 
        }, { status: 500 });
      }

      console.log('Resend email sent successfully. ID:', data?.id);
      return NextResponse.json({ success: true });
    } catch (emailError: any) {
      console.error('Failed to send resend email via Resend:', emailError);
      const message = process.env.NODE_ENV === 'development' 
        ? `Resend error: ${emailError?.message || emailError}` 
        : 'Failed to send email';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Resend magic link error:', error)
    return NextResponse.json({ error: 'Failed to send magic link. Please try again later.' }, { status: 500 })
  }
}
