import { cookies } from 'next/headers'
import { createSupabaseAdmin, getSessionProfile } from '@/lib/portal-auth'
import {
  DEFAULT_THEME,
  THEME_COOKIE_NAME,
  normalizeThemePreference,
  type ThemePreference,
} from '@/lib/theme'

export async function getUserThemePreference(): Promise<ThemePreference> {
  const session = await getSessionProfile()

  if (!session) {
    const cookieStore = await cookies()
    return normalizeThemePreference(cookieStore.get(THEME_COOKIE_NAME)?.value)
  }

  const supabaseAdmin = createSupabaseAdmin()
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('theme_preference')
    .eq('id', session.userId)
    .single()

  return normalizeThemePreference(profile?.theme_preference)
}

export async function getThemeScriptDefault(): Promise<ThemePreference> {
  try {
    return await getUserThemePreference()
  } catch {
    return DEFAULT_THEME
  }
}