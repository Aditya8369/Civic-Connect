import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

describe('formatRelativeTime', () => {
  const baseNow = new Date('2026-11-13T12:00:00Z')

  it('returns empty string for null, undefined or empty input', () => {
    expect(formatRelativeTime(null)).toBe('')
    expect(formatRelativeTime(undefined)).toBe('')
    expect(formatRelativeTime('')).toBe('')
    expect(formatRelativeTime('invalid-date')).toBe('')
  })

  it('returns "Just now" for dates less than 60 seconds ago or in future', () => {
    const justNowDate = new Date('2026-11-13T11:59:45Z') // 15s ago
    expect(formatRelativeTime(justNowDate, baseNow)).toBe('Just now')

    const futureDate = new Date('2026-11-13T12:05:00Z')
    expect(formatRelativeTime(futureDate, baseNow)).toBe('Just now')
  })

  it('returns minute-based relative time ("10m ago")', () => {
    const tenMinAgo = new Date('2026-11-13T11:50:00Z')
    expect(formatRelativeTime(tenMinAgo, baseNow)).toBe('10m ago')

    const oneMinAgo = new Date('2026-11-13T11:59:00Z')
    expect(formatRelativeTime(oneMinAgo, baseNow)).toBe('1m ago')

    const fiftyNineMinAgo = new Date('2026-11-13T11:01:00Z')
    expect(formatRelativeTime(fiftyNineMinAgo, baseNow)).toBe('59m ago')
  })

  it('returns hour-based relative time ("2h ago")', () => {
    const twoHoursAgo = new Date('2026-11-13T10:00:00Z')
    expect(formatRelativeTime(twoHoursAgo, baseNow)).toBe('2h ago')

    const fiveHoursAgo = new Date('2026-11-13T07:00:00Z')
    expect(formatRelativeTime(fiveHoursAgo, baseNow)).toBe('5h ago')
  })

  it('returns "Yesterday" for timestamps from calendar yesterday', () => {
    const yesterdayDate = new Date('2026-11-12T16:30:00Z')
    expect(formatRelativeTime(yesterdayDate, baseNow)).toBe('Yesterday')

    const yesterdayMorning = new Date('2026-11-12T08:00:00Z')
    expect(formatRelativeTime(yesterdayMorning, baseNow)).toBe('Yesterday')
  })

  it('returns formatted short date for dates older than yesterday', () => {
    const olderDateSameYear = new Date('2026-10-14T10:00:00Z')
    expect(formatRelativeTime(olderDateSameYear, baseNow)).toBe('Oct 14')

    const olderDateDifferentYear = new Date('2025-05-20T10:00:00Z')
    expect(formatRelativeTime(olderDateDifferentYear, baseNow)).toBe('May 20, 2025')
  })

  it('supports Firestore Timestamp objects with .toDate()', () => {
    const fakeFirestoreTimestamp = {
      toDate: () => new Date('2026-11-13T11:50:00Z'),
    }
    expect(formatRelativeTime(fakeFirestoreTimestamp, baseNow)).toBe('10m ago')
  })

  it('supports numeric epoch timestamps in milliseconds and seconds', () => {
    const millis = new Date('2026-11-13T11:50:00Z').getTime()
    expect(formatRelativeTime(millis, baseNow)).toBe('10m ago')

    const seconds = Math.floor(millis / 1000)
    expect(formatRelativeTime(seconds, baseNow)).toBe('10m ago')
  })

  it('supports ISO date strings', () => {
    expect(formatRelativeTime('2026-11-13T11:50:00Z', baseNow)).toBe('10m ago')
  })
})

