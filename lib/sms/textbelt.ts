import { normalizePhoneForSms } from '@/lib/notifications'

export function isTextbeltConfigured() {
  return Boolean(process.env.TEXTBELT_API_KEY?.trim() || true)
}

export function getTextbeltApiKey() {
  return process.env.TEXTBELT_API_KEY?.trim() || 'textbelt'
}

export async function sendTextbeltSms(input: {
  phone: string
  message: string
}): Promise<{ ok: true; textId?: number } | { ok: false; error: string }> {
  const phone = normalizePhoneForSms(input.phone)
  if (!phone) {
    return { ok: false, error: 'A valid phone number is required for SMS' }
  }

  const message = input.message.trim()
  if (!message) return { ok: false, error: 'SMS message is required' }

  try {
    const body = new URLSearchParams({
      phone,
      message,
      key: getTextbeltApiKey(),
    })

    const response = await fetch('https://textbelt.com/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const payload = (await response.json()) as {
      success?: boolean
      error?: string
      textId?: number
      quotaRemaining?: number
    }

    if (!payload.success) {
      return {
        ok: false,
        error: payload.error || 'Failed to send SMS',
      }
    }

    return { ok: true, textId: payload.textId }
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send SMS' }
  }
}