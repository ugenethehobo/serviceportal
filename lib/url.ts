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
  // Diagnostic logging - this will appear in every Vercel function log when URLs are resolved
  console.log('[getAppBaseUrl] raw envs:', {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_URL: process.env.VERCEL_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PUBLIC_URL: process.env.NEXT_PUBLIC_PUBLIC_URL,
  });

  const vercelUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : null;

  const ngrokOverride = process.env.NEXT_PUBLIC_PUBLIC_URL;
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;

  // 1. Explicit ngrok / tunnel override (only for local testing).
  //    This should normally be empty or unset in Vercel.
  if (ngrokOverride && (ngrokOverride.includes('ngrok') || ngrokOverride.includes('localhost:3000'))) {
    const result = ngrokOverride.replace(/\/$/, '');
    console.log('[getAppBaseUrl] → using ngrok override:', result);
    return result;
  }

  const isOnVercel = !!process.env.VERCEL_ENV;

  // 2. When running on Vercel, prefer the current deployment URL for previews.
  //    On Production deploys, we are extremely strict about never using localhost.
  if (isOnVercel && vercelUrl) {
    if (process.env.VERCEL_ENV === 'production') {
      // In production: only trust an explicitly configured custom domain if it looks real.
      // Otherwise force servport.pro (our canonical production domain).
      if (configuredUrl &&
          configuredUrl.startsWith('https://') &&
          !configuredUrl.includes('localhost') &&
          !configuredUrl.includes('127.0.0.1') &&
          !configuredUrl.includes('vercel.app')) {
        const result = configuredUrl.replace(/\/$/, '');
        console.log('[getAppBaseUrl] → using configured prod URL:', result);
        return result;
      }
      console.log('[getAppBaseUrl] → forcing production domain for safety: https://servport.pro');
      return 'https://servport.pro';
    }
    // Previews → current Vercel deployment is correct
    console.log('[getAppBaseUrl] → using current Vercel deployment:', vercelUrl);
    return vercelUrl;
  }

  // 3. Non-Vercel or fallback
  if (configuredUrl &&
      configuredUrl.startsWith('https://') &&
      !configuredUrl.includes('localhost') &&
      !configuredUrl.includes('127.0.0.1')) {
    const result = configuredUrl.replace(/\/$/, '');
    console.log('[getAppBaseUrl] → using configured URL (non-vercel):', result);
    return result;
  }

  // 4. Final production safety net
  if (process.env.VERCEL_ENV === 'production') {
    console.log('[getAppBaseUrl] → final safety net, using https://servport.pro');
    return 'https://servport.pro';
  }

  // 5. Local development default
  console.log('[getAppBaseUrl] → defaulting to localhost (dev)');
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
