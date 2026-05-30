/**
 * Centralized public URL resolution for the app.
 *
 * Used for:
 * - Magic link redirectTo (Supabase generateLink)
 * - Stripe success/cancel URLs
 * - Any other emails or external redirects
 *
 * This prevents the recurring problem of stale preview/ngrok/localhost URLs
 * ending up in customer-facing links and emails.
 */
export function getAppBaseUrl(): string {
  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

  const ngrokOverride = process.env.NEXT_PUBLIC_PUBLIC_URL;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  // 1. Explicit ngrok / tunnel override (only for local testing).
  //    This should normally be empty or unset in Vercel.
  if (ngrokOverride && (ngrokOverride.includes('ngrok') || ngrokOverride.includes('localhost:3000'))) {
    return ngrokOverride.replace(/\/$/, '');
  }

  const isOnVercel = !!process.env.VERCEL_ENV;

  // 2. When running on Vercel, prefer the current deployment URL for previews.
  //    On Production deploys with a custom domain, we prefer an explicitly
  //    configured production URL (see recommendation below).
  if (isOnVercel && vercelUrl) {
    if (process.env.VERCEL_ENV === 'production') {
      // In production, if NEXT_PUBLIC_APP_URL is set to a real custom domain, use it.
      if (configuredUrl &&
          !configuredUrl.includes('localhost') &&
          !configuredUrl.includes('127.0.0.1') &&
          !configuredUrl.includes('vercel.app')) {
        return configuredUrl.replace(/\/$/, '');
      }
      // Stable production fallback now that we own servport.pro
      return 'https://servport.pro';
    }
    // Previews / other Vercel environments → use the current deployment
    return vercelUrl;
  }

  // 3. Non-Vercel or fallback: use configured URL if it looks like a real domain
  if (configuredUrl &&
      !configuredUrl.includes('localhost') &&
      !configuredUrl.includes('127.0.0.1')) {
    return configuredUrl.replace(/\/$/, '');
  }

  // 4. Final production safety net (in case env vars are missing on a prod deploy)
  if (process.env.VERCEL_ENV === 'production') {
    return 'https://servport.pro';
  }

  // 5. Local development
  return 'http://localhost:3000';
}

/**
 * RECOMMENDED VERCEL ENVIRONMENT VARIABLES (Production scope)
 *
 * 1. NEXT_PUBLIC_APP_URL = https://servport.pro
 *    (Set ONLY in the "Production" environment scope)
 *
 * 2. (Optional but recommended) Keep NEXT_PUBLIC_PUBLIC_URL empty in Vercel,
 *    or only set it locally in .env.local when using ngrok.
 *
 * This + the logic above guarantees that magic links, Stripe redirects, etc.
 * always use the correct live domain for real customers.
 */
