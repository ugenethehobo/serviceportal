import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildClientGeocodeAddressKey,
  readStoredGeocode,
  resolveGeocodeResults,
} from '@/lib/address-geocoding'

test('buildClientGeocodeAddressKey normalizes structured client addresses', () => {
  const key = buildClientGeocodeAddressKey({
    address_street: '123 Main St',
    address_city: 'Austin',
    address_state: 'TX',
    address_zip: '78701',
  })

  assert.equal(key, '123 main st, austin, tx 78701')
})

test('readStoredGeocode returns cached coordinates when the address key matches', () => {
  const stored = readStoredGeocode(
    {
      latitude: 30.2672,
      longitude: -97.7431,
      geocode_address_key: '123 main st, austin, tx 78701',
    },
    '123 main st, austin, tx 78701'
  )

  assert.ok(stored?.success)
  assert.equal(stored?.latitude, 30.2672)
  assert.equal(stored?.longitude, -97.7431)
})

test('readStoredGeocode misses when the stored address key is stale', () => {
  const stored = readStoredGeocode(
    {
      latitude: 30.2672,
      longitude: -97.7431,
      geocode_address_key: 'old address',
    },
    '123 main st, austin, tx 78701'
  )

  assert.equal(stored, null)
})

test('resolveGeocodeResults reuses stored coordinates without creating persist work', async () => {
  const resolved = await resolveGeocodeResults([
    {
      id: 'client-a',
      address: '10 Oak St, Chicago, IL 60601',
      addressKey: '10 oak st, chicago, il 60601',
      stored: {
        latitude: 41.88,
        longitude: -87.63,
        geocode_address_key: '10 oak st, chicago, il 60601',
      },
      persistTarget: 'client',
      persistId: 'client-a',
    },
    {
      id: 'company',
      address: '500 W Madison St, Chicago, IL 60661',
      addressKey: '500 w madison st, chicago, il 60661',
      stored: {
        latitude: 41.88,
        longitude: -87.64,
        geocode_address_key: '500 w madison st, chicago, il 60661',
      },
      persistTarget: 'company',
    },
  ])

  assert.equal(resolved.results.get('client-a')?.success, true)
  assert.equal(resolved.results.get('company')?.success, true)
  assert.equal(resolved.clientPersist.size, 0)
  assert.equal(resolved.companyPersist, null)
})