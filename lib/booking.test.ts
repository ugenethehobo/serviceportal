import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getPublicBookingUrl,
  isValidBookingSlug,
  normalizeBookingMode,
  normalizeBookingSettings,
  slugifyBookingSlug,
  suggestBookingSlug,
} from '@/lib/booking'

describe('booking helpers', () => {
  it('normalizes booking mode to either online booking or request form', () => {
    assert.equal(normalizeBookingMode('online_booking'), 'online_booking')
    assert.equal(normalizeBookingMode('request_form'), 'request_form')
    assert.equal(normalizeBookingMode('other'), 'request_form')
  })

  it('slugifies company names for booking links', () => {
    assert.equal(slugifyBookingSlug('Acme Lawn Care!'), 'acme-lawn-care')
    assert.equal(suggestBookingSlug('Acme Lawn Care!'), 'acme-lawn-care')
    assert.equal(suggestBookingSlug('AB'), 'book-service')
  })

  it('validates booking slug format', () => {
    assert.equal(isValidBookingSlug('acme-lawn'), true)
    assert.equal(isValidBookingSlug('ab'), false)
    assert.equal(isValidBookingSlug('Acme'), false)
    assert.equal(isValidBookingSlug('acme--care'), false)
  })

  it('builds public booking URLs', () => {
    assert.equal(
      getPublicBookingUrl('acme-lawn', 'https://app.example.com/'),
      'https://app.example.com/book/acme-lawn'
    )
  })

  it('normalizes booking settings with defaults', () => {
    assert.deepEqual(normalizeBookingSettings(null), {
      welcome_message: null,
      request_form_heading: 'Request service',
      online_booking_heading: 'Book online',
      travel_buffer_minutes: 15,
      min_notice_hours: 2,
      slot_interval_minutes: 30,
      lookahead_days: 28,
      bookable_weekdays: [1, 2, 3, 4, 5],
    })
    assert.deepEqual(
      normalizeBookingSettings({
        welcome_message: '  Hello  ',
        request_form_heading: 'Get a quote',
        travel_buffer_minutes: 30,
        bookable_weekdays: [6, 0],
      }),
      {
        welcome_message: 'Hello',
        request_form_heading: 'Get a quote',
        online_booking_heading: 'Book online',
        travel_buffer_minutes: 30,
        min_notice_hours: 2,
        slot_interval_minutes: 30,
        lookahead_days: 28,
        bookable_weekdays: [0, 6],
      }
    )
  })
})