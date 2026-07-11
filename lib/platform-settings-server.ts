import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { isPastScheduledRelease } from '@/lib/platform-release-schedule'
import {
  getDefaultPlatformReleaseMode,
  isPlatformReleaseMode,
  type PlatformReleaseMode,
  type PlatformSettings,
} from '@/lib/platform-settings'

function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function revalidatePlatformPaths() {
  revalidatePath('/')
  revalidatePath('/signup')
  revalidatePath('/admin')
  revalidatePath('/admin/settings')
  revalidatePath('/dashboard')
}

type PlatformSettingsRow = {
  release_mode?: string | null
  scheduled_release_at?: string | null
}

async function maybeAutoSwitchToRelease(
  admin: ReturnType<typeof createSupabaseAdmin>,
  row: PlatformSettingsRow | null
): Promise<PlatformSettings> {
  const scheduledReleaseAt = row?.scheduled_release_at ?? null
  let releaseMode: PlatformReleaseMode = isPlatformReleaseMode(row?.release_mode)
    ? row.release_mode
    : getDefaultPlatformReleaseMode()

  if (
    releaseMode === 'beta' &&
    scheduledReleaseAt &&
    isPastScheduledRelease(scheduledReleaseAt)
  ) {
    const { error } = await admin.from('platform_settings').upsert(
      {
        id: 'default',
        release_mode: 'release',
        scheduled_release_at: scheduledReleaseAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (!error) {
      releaseMode = 'release'
      revalidatePlatformPaths()
    } else {
      console.error('maybeAutoSwitchToRelease error:', error)
    }
  }

  return { releaseMode, scheduledReleaseAt }
}

async function loadPlatformSettingsRow(
  admin: ReturnType<typeof createSupabaseAdmin>
): Promise<PlatformSettingsRow | null> {
  const full = await admin
    .from('platform_settings')
    .select('release_mode, scheduled_release_at')
    .eq('id', 'default')
    .maybeSingle()

  if (full.error?.code === '42703') {
    const fallback = await admin
      .from('platform_settings')
      .select('release_mode')
      .eq('id', 'default')
      .maybeSingle()
    if (fallback.error) throw fallback.error
    return fallback.data
  }

  if (full.error) throw full.error
  return full.data
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const admin = createSupabaseAdmin()
    const data = await loadPlatformSettingsRow(admin)
    return maybeAutoSwitchToRelease(admin, data)
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : null

    if (code === '42P01') {
      return {
        releaseMode: getDefaultPlatformReleaseMode(),
        scheduledReleaseAt: null,
      }
    }

    console.error('getPlatformSettings error:', error)
    return {
      releaseMode: getDefaultPlatformReleaseMode(),
      scheduledReleaseAt: null,
    }
  }
}

export async function getPlatformReleaseMode(): Promise<PlatformReleaseMode> {
  const settings = await getPlatformSettings()
  return settings.releaseMode
}

export async function setPlatformReleaseMode(
  mode: PlatformReleaseMode
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPlatformReleaseMode(mode)) {
    return { ok: false, error: 'Invalid release mode' }
  }

  try {
    const admin = createSupabaseAdmin()
    const { data: existing } = await admin
      .from('platform_settings')
      .select('scheduled_release_at')
      .eq('id', 'default')
      .maybeSingle()

    const { error } = await admin.from('platform_settings').upsert(
      {
        id: 'default',
        release_mode: mode,
        scheduled_release_at: existing?.scheduled_release_at ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (error?.code === '42P01') {
      return {
        ok: false,
        error: 'platform_settings table is missing. Run supabase/platform-settings-schema.sql.',
      }
    }

    if (error) {
      return { ok: false, error: error.message || 'Failed to save release mode' }
    }

    revalidatePlatformPaths()
    return { ok: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save release mode'
    return { ok: false, error: message }
  }
}

export async function setPlatformReleaseSchedule(
  scheduledReleaseAt: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createSupabaseAdmin()
    const { data: existing } = await admin
      .from('platform_settings')
      .select('release_mode')
      .eq('id', 'default')
      .maybeSingle()

    const releaseMode: PlatformReleaseMode = isPlatformReleaseMode(existing?.release_mode)
      ? existing.release_mode
      : getDefaultPlatformReleaseMode()

    const { error } = await admin.from('platform_settings').upsert(
      {
        id: 'default',
        release_mode: releaseMode,
        scheduled_release_at: scheduledReleaseAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

    if (error?.code === '42P01') {
      return {
        ok: false,
        error: 'platform_settings table is missing. Run supabase/platform-settings-schema.sql.',
      }
    }

    if (error?.code === '42703') {
      return {
        ok: false,
        error:
          'scheduled_release_at column is missing. Re-run supabase/platform-settings-schema.sql.',
      }
    }

    if (error) {
      return { ok: false, error: error.message || 'Failed to save release schedule' }
    }

    revalidatePlatformPaths()
    return { ok: true }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save release schedule'
    return { ok: false, error: message }
  }
}