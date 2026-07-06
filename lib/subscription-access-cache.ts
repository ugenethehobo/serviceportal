import type { CompanySubscriptionAccess } from '@/lib/platform-trial'

type CacheEntry = {
  value: CompanySubscriptionAccess
  expiresAt: number
}

const TTL_MS = 30_000

const companyCache = new Map<string, CacheEntry>()
const clientCompanyCache = new Map<string, CacheEntry>()

function readCache(cache: Map<string, CacheEntry>, key: string) {
  const entry = cache.get(key)
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function writeCache(
  cache: Map<string, CacheEntry>,
  key: string,
  value: CompanySubscriptionAccess
) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS })
}

export function getCachedCompanySubscriptionAccess(companyId: string) {
  return readCache(companyCache, companyId)
}

export function setCachedCompanySubscriptionAccess(
  companyId: string,
  access: CompanySubscriptionAccess
) {
  writeCache(companyCache, companyId, access)
}

export function getCachedClientCompanySubscriptionAccess(clientId: string) {
  return readCache(clientCompanyCache, clientId)
}

export function setCachedClientCompanySubscriptionAccess(
  clientId: string,
  access: CompanySubscriptionAccess
) {
  writeCache(clientCompanyCache, clientId, access)
}