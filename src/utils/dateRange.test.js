import { describe, it, expect } from 'vitest'
import { matchesDateRange, parseDateInput } from './dateRange'

const NOW = new Date(2026, 10, 12, 12, 0, 0)
const HOUR = 3600000

function complaint(overrides = {}) {
  return { id: 'a', status: 'Pending', createdAt: new Date(NOW.getTime() - 2 * HOUR), ...overrides }
}

describe('parseDateInput', () => {
  it('parses YYYY-MM-DD as local start and end of day', () => {
    expect(parseDateInput('2026-11-05')).toEqual(new Date(2026, 10, 5, 0, 0, 0, 0))
    expect(parseDateInput('2026-11-05', { endOfDay: true })).toEqual(
      new Date(2026, 10, 5, 23, 59, 59, 999)
    )
  })

  it('returns null for empty or malformed values', () => {
    expect(parseDateInput('')).toBeNull()
    expect(parseDateInput(undefined)).toBeNull()
    expect(parseDateInput('05/11/2026')).toBeNull()
  })
})

describe('matchesDateRange', () => {
  const c = complaint({ createdAt: new Date(2026, 10, 5, 15, 30) })

  it('accepts everything when no bounds are set', () => {
    expect(matchesDateRange(c, '', '')).toBe(true)
    expect(matchesDateRange(complaint({ createdAt: null }), '', '')).toBe(true)
  })

  it('includes both boundary days', () => {
    expect(matchesDateRange(c, '2026-11-05', '2026-11-05')).toBe(true)
    expect(matchesDateRange(c, '2026-11-06', '')).toBe(false)
    expect(matchesDateRange(c, '', '2026-11-04')).toBe(false)
  })

  it('excludes complaints without a valid date once a bound is set', () => {
    expect(matchesDateRange(complaint({ createdAt: null }), '2026-11-01', '')).toBe(false)
  })

  it('works with Firestore-style timestamps', () => {
    const ts = { toDate: () => new Date(2026, 10, 5, 9, 0) }
    expect(matchesDateRange(complaint({ createdAt: ts }), '2026-11-05', '2026-11-05')).toBe(true)
  })
})
