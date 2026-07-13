import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildGeocodePersistFields,
  resolveGeocodeResults,
  type GeocodePersistUpdate,
} from '@/lib/address-geocoding'

export async function persistClientGeocodes(
  supabaseAdmin: SupabaseClient,
  updates: Map<string, GeocodePersistUpdate>
) {
  await Promise.all(
    [...updates.entries()].map(async ([clientId, update]) => {
      const { error } = await supabaseAdmin
        .from('clients')
        .update(buildGeocodePersistFields(
          {
            success: true,
            latitude: update.latitude,
            longitude: update.longitude,
            displayName: update.addressKey,
          },
          update.addressKey
        ))
        .eq('id', clientId)

      if (error) {
        console.error(`persistClientGeocodes failed for ${clientId}:`, error)
      }
    })
  )
}

export async function persistCompanyGeocode(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  update: GeocodePersistUpdate
) {
  const { error } = await supabaseAdmin
    .from('companies')
    .update(
      buildGeocodePersistFields(
        {
          success: true,
          latitude: update.latitude,
          longitude: update.longitude,
          displayName: update.addressKey,
        },
        update.addressKey
      )
    )
    .eq('id', companyId)

  if (error) {
    console.error(`persistCompanyGeocode failed for ${companyId}:`, error)
  }
}

export async function persistResolvedGeocodes(
  supabaseAdmin: SupabaseClient,
  companyId: string,
  resolved: Awaited<ReturnType<typeof resolveGeocodeResults>>
) {
  if (resolved.clientPersist.size > 0) {
    await persistClientGeocodes(supabaseAdmin, resolved.clientPersist)
  }

  if (resolved.companyPersist) {
    await persistCompanyGeocode(supabaseAdmin, companyId, resolved.companyPersist)
  }
}