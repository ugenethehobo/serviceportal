export type PlatformReleaseMode = 'beta' | 'release'

export const PLATFORM_RELEASE_MODES: PlatformReleaseMode[] = ['beta', 'release']

export function isPlatformReleaseMode(value: string | null | undefined): value is PlatformReleaseMode {
  return value === 'beta' || value === 'release'
}

export function getDefaultPlatformReleaseMode(): PlatformReleaseMode {
  const env = process.env.PLATFORM_DEFAULT_RELEASE_MODE?.trim().toLowerCase()
  return env === 'release' ? 'release' : 'beta'
}

export function isBetaReleaseMode(mode: PlatformReleaseMode): boolean {
  return mode === 'beta'
}

export type PlatformSettings = {
  releaseMode: PlatformReleaseMode
  scheduledReleaseAt: string | null
}