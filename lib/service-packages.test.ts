import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyServicePackageToJobForm,
  buildRequestedServicesNote,
  sumServicePackageEstimates,
  type ServicePackage,
} from './service-packages.ts'

const samplePackage: ServicePackage = {
  id: 'pkg-1',
  company_id: 'co-1',
  name: 'Standard cleaning',
  description: 'Kitchen, baths, and floors',
  duration_minutes: 120,
  price_estimate: 150,
  active: true,
  sort_order: 0,
}

test('applyServicePackageToJobForm fills title, description, price, and end time', () => {
  const result = applyServicePackageToJobForm(
    samplePackage,
    {
      title: '',
      description: '',
      startTime: '2026-07-10T09:00',
      endTime: '',
      crewId: '',
      recurrence: 'none',
      price: '',
    },
    'America/Chicago'
  )

  assert.equal(result.title, 'Standard cleaning')
  assert.equal(result.description, 'Kitchen, baths, and floors')
  assert.equal(result.price, '150')
  assert.match(result.endTime, /^2026-07-10T11:00/)
})

test('buildRequestedServicesNote combines services and freeform notes', () => {
  const note = buildRequestedServicesNote(
    [samplePackage, { ...samplePackage, id: 'pkg-2', name: 'Window wash' }],
    'Please call before arriving'
  )
  assert.match(note!, /Requested services: Standard cleaning, Window wash/)
  assert.match(note!, /Please call before arriving/)
})

test('sumServicePackageEstimates totals priced packages', () => {
  assert.equal(
    sumServicePackageEstimates([
      samplePackage,
      { ...samplePackage, id: 'pkg-2', price_estimate: 50 },
    ]),
    200
  )
  assert.equal(
    sumServicePackageEstimates([{ ...samplePackage, price_estimate: null }]),
    null
  )
})