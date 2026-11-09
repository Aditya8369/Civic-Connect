import { describe, expect, it } from 'vitest'
import {
  parseTimestamp,
  getSlaDurationHours,
  getSlaTargetDate,
  formatDurationHours,
  formatRemainingTime,
  computeSlaStatus,
  getSlaStatus,
  isSlaBreached,
  DEFAULT_SLA_HOURS,
} from './sla'

describe('parseTimestamp', () => {
  it('parses Firestore timestamp object with toDate()', () => {
    const date = new Date('2026-03-01T10:00:00Z')
    const ts = { toDate: () => date }
    expect(parseTimestamp(ts)).toBe(date.getTime())
  })

  it('parses JavaScript Date instance', () => {
    const date = new Date('2026-03-01T10:00:00Z')
    expect(parseTimestamp(date)).toBe(date.getTime())
  })

  it('parses object with seconds property', () => {
    expect(parseTimestamp({ seconds: 1700000000 })).toBe(1700000000000)
  })

  it('parses numeric epoch millisecond timestamp', () => {
    const now = 1710000000000
    expect(parseTimestamp(now)).toBe(now)
  })

  it('parses ISO date string', () => {
    const iso = '2026-03-01T12:00:00.000Z'
    expect(parseTimestamp(iso)).toBe(new Date(iso).getTime())
  })

  it.each([
    null,
    undefined,
    '',
    'invalid-date',
    -100,
    0,
    { toDate: () => 'not-a-date' },
    {},
  ])('returns null for invalid timestamp: %s', (invalid) => {
    expect(parseTimestamp(invalid)).toBeNull()
  })
})

describe('getSlaDurationHours', () => {
  it('gives precedence to department over category', () => {
    // Water category is 24h, but Roads department is 168h
    expect(getSlaDurationHours('Water Leakage', 'Roads')).toBe(168)
  })

  it('returns correct hours for each department', () => {
    expect(getSlaDurationHours(null, 'Roads')).toBe(168)
    expect(getSlaDurationHours(null, 'Infrastructure')).toBe(168)
    expect(getSlaDurationHours(null, 'Sanitation')).toBe(48)
    expect(getSlaDurationHours(null, 'Electricity')).toBe(24)
    expect(getSlaDurationHours(null, 'Water')).toBe(24)
    expect(getSlaDurationHours(null, 'Public Safety')).toBe(24)
  })

  it('falls back to category when department is unassigned', () => {
    expect(getSlaDurationHours('Potholes & Road Damage', '')).toBe(168)
    expect(getSlaDurationHours('Streetlight Issues', null)).toBe(24)
    expect(getSlaDurationHours('Water Leakage', undefined)).toBe(24)
    expect(getSlaDurationHours('Garbage & Sanitation', '')).toBe(48)
    expect(getSlaDurationHours('Noise Pollution', '')).toBe(24)
    expect(getSlaDurationHours('Traffic Issues', '')).toBe(24)
    expect(getSlaDurationHours('Illegal Construction', '')).toBe(48)
    expect(getSlaDurationHours('Other', '')).toBe(48)
  })

  it('performs case-insensitive department and category lookup', () => {
    expect(getSlaDurationHours(null, 'roads')).toBe(168)
    expect(getSlaDurationHours(null, 'ROADS')).toBe(168)
    expect(getSlaDurationHours('potholes & road damage', '')).toBe(168)
    expect(getSlaDurationHours(null, 'sanitation')).toBe(48)
    expect(getSlaDurationHours(null, 'electricity')).toBe(24)
    expect(getSlaDurationHours(null, 'WATER')).toBe(24)
    expect(getSlaDurationHours(null, 'public safety')).toBe(24)
  })

  it('returns default SLA duration for unknown department and category', () => {
    expect(getSlaDurationHours('Unknown Category', 'Unknown Dept')).toBe(DEFAULT_SLA_HOURS)
    expect(getSlaDurationHours('', '')).toBe(DEFAULT_SLA_HOURS)
    expect(getSlaDurationHours(null, null)).toBe(DEFAULT_SLA_HOURS)
  })
})

describe('getSlaTargetDate', () => {
  it('computes expected deadline date', () => {
    const created = new Date('2026-03-01T00:00:00Z')
    const target = getSlaTargetDate(created, 'Streetlight Issues') // 24h
    expect(target).toEqual(new Date('2026-03-02T00:00:00Z'))
  })

  it('returns null for invalid createdAt', () => {
    expect(getSlaTargetDate(null, 'Streetlight Issues')).toBeNull()
  })
})

describe('formatDurationHours', () => {
  it('formats hours less than 1', () => {
    expect(formatDurationHours(0)).toBe('<1h')
  })

  it('formats hours under 24', () => {
    expect(formatDurationHours(5)).toBe('5h')
    expect(formatDurationHours(23)).toBe('23h')
  })

  it('formats multi-day durations', () => {
    expect(formatDurationHours(24)).toBe('1d')
    expect(formatDurationHours(26)).toBe('1d 2h')
    expect(formatDurationHours(168)).toBe('7d')
  })
})

describe('formatRemainingTime', () => {
  it('formats 0 milliseconds', () => {
    expect(formatRemainingTime(0)).toBe('00h 00m 00s')
  })

  it('formats hours, minutes, and seconds', () => {
    const ms = (2 * 3600 + 15 * 60 + 30) * 1000 // 2h 15m 30s
    expect(formatRemainingTime(ms)).toBe('02h 15m 30s')
  })

  it('formats multi-day remaining time', () => {
    const ms = (25 * 3600 + 5 * 60 + 5) * 1000 // 1d 1h 5m 5s
    expect(formatRemainingTime(ms)).toBe('1d 01h 05m 05s')
  })

  it('handles negative durations (overdue) using absolute time', () => {
    const ms = -1 * (3 * 3600 + 40 * 60) * 1000 // -3h 40m
    expect(formatRemainingTime(ms)).toBe('03h 40m 00s')
  })

  it('returns empty string for non-numbers or NaN', () => {
    expect(formatRemainingTime(null)).toBe('')
    expect(formatRemainingTime(NaN)).toBe('')
    expect(formatRemainingTime('100')).toBe('')
  })
})

describe('computeSlaStatus', () => {
  const baseTime = 1740000000000 // Fixed reference time (ms)

  it('returns null for missing complaint', () => {
    expect(computeSlaStatus(null)).toBeNull()
    expect(computeSlaStatus(undefined)).toBeNull()
  })

  it('returns invalid state when createdAt is missing', () => {
    const status = computeSlaStatus({ title: 'Test', status: 'Pending' })
    expect(status.isValid).toBe(false)
    expect(status.badgeText).toBeNull()
  })

  describe('Resolved complaints', () => {
    it('shows resolution time under 1 hour', () => {
      const complaint = {
        status: 'Resolved',
        createdAt: baseTime,
        resolvedAt: baseTime + 30 * 60 * 1000, // 30 mins
      }
      const status = computeSlaStatus(complaint, baseTime + 100000)
      expect(status.isResolved).toBe(true)
      expect(status.badgeVariant).toBe('success')
      expect(status.badgeText).toBe('Resolved in <1 hour')
    })

    it('shows resolution time of exactly 1 hour', () => {
      const complaint = {
        status: 'Resolved',
        createdAt: baseTime,
        resolvedAt: baseTime + 60 * 60 * 1000,
      }
      const status = computeSlaStatus(complaint, baseTime + 100000)
      expect(status.badgeText).toBe('Resolved in 1 hour')
    })

    it('shows resolution time under 24 hours', () => {
      const complaint = {
        status: 'Resolved',
        createdAt: baseTime,
        resolvedAt: baseTime + 18 * 60 * 60 * 1000,
      }
      const status = computeSlaStatus(complaint, baseTime + 100000)
      expect(status.badgeText).toBe('Resolved in 18 hours')
    })

    it('shows resolution time spanning multiple days in hours', () => {
      const complaint = {
        status: 'Resolved',
        createdAt: baseTime,
        resolvedAt: baseTime + 52 * 60 * 60 * 1000,
      }
      const status = computeSlaStatus(complaint, baseTime + 100000)
      expect(status.badgeText).toBe('Resolved in 52 hours')
    })

    it('falls back to updatedAt when resolvedAt is missing', () => {
      const complaint = {
        status: 'Resolved',
        createdAt: baseTime,
        updatedAt: baseTime + 5 * 60 * 60 * 1000,
      }
      const status = computeSlaStatus(complaint, baseTime + 100000)
      expect(status.badgeText).toBe('Resolved in 5 hours')
    })
  })

  describe('Rejected complaints', () => {
    it('returns isRejected: true and null badgeText', () => {
      const complaint = {
        status: 'Rejected',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, baseTime + 10000)
      expect(status.isRejected).toBe(true)
      expect(status.badgeText).toBeNull()
    })
  })

  describe('Active complaints boundary conditions (Pending / In Progress / Reopened)', () => {
    const slaDurationHours = 24 // e.g. Electricity
    const deadlineMs = baseTime + slaDurationHours * 3600000

    it('displays normal remaining time when more than 6 hours remain', () => {
      const now = deadlineMs - 10 * 3600000 // 10h remaining
      const complaint = {
        status: 'Pending',
        category: 'Streetlight Issues', // 24h
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isBreached).toBe(false)
      expect(status.isDueSoon).toBe(false)
      expect(status.pulsing).toBe(false)
      expect(status.badgeVariant).toBe('outline')
      expect(status.badgeText).toBe('10h left')
    })

    it('treats remainingMs = 6 hours + 1 ms as on track (> 6 hours)', () => {
      const now = deadlineMs - (6 * 3600000 + 1)
      const complaint = {
        status: 'In Progress',
        category: 'Streetlight Issues',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isDueSoon).toBe(false)
      expect(status.badgeVariant).toBe('outline')
    })

    it('boundary: displays "Urgent - Due Soon" when remainingMs = exactly 6 hours', () => {
      const now = deadlineMs - 6 * 3600000
      const complaint = {
        status: 'Pending',
        category: 'Streetlight Issues',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isDueSoon).toBe(true)
      expect(status.isBreached).toBe(false)
      expect(status.pulsing).toBe(false)
      expect(status.badgeVariant).toBe('warning')
      expect(status.badgeText).toBe('Urgent - Due Soon')
    })

    it('displays "Urgent - Due Soon" when within 6 hours (e.g. 2 hours remaining)', () => {
      const now = deadlineMs - 2 * 3600000
      const complaint = {
        status: 'Reopened',
        category: 'Streetlight Issues',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isDueSoon).toBe(true)
      expect(status.isBreached).toBe(false)
      expect(status.badgeVariant).toBe('warning')
      expect(status.badgeText).toBe('Urgent - Due Soon')
    })

    it('boundary: displays "SLA Breached" when remainingMs = exactly 0 ms', () => {
      const now = deadlineMs
      const complaint = {
        status: 'Pending',
        category: 'Streetlight Issues',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isBreached).toBe(true)
      expect(status.pulsing).toBe(true)
      expect(status.badgeVariant).toBe('destructive')
      expect(status.badgeText).toBe('SLA Breached')
    })

    it('displays "SLA Breached" with pulsing red when overdue (remainingMs < 0)', () => {
      const now = deadlineMs + 5 * 3600000 // 5 hours overdue
      const complaint = {
        status: 'In Progress',
        category: 'Streetlight Issues',
        createdAt: baseTime,
      }
      const status = computeSlaStatus(complaint, now)
      expect(status.isBreached).toBe(true)
      expect(status.pulsing).toBe(true)
      expect(status.overdueHours).toBe(5)
      expect(status.badgeVariant).toBe('destructive')
      expect(status.badgeText).toBe('SLA Breached')
    })
  })
})

describe('isSlaBreached', () => {
  const baseTime = 1740000000000
  const deadlineMs = baseTime + 24 * 3600000 // 24h SLA

  it('returns true when active ticket is overdue', () => {
    const complaint = {
      status: 'Pending',
      category: 'Streetlight Issues',
      createdAt: baseTime,
    }
    expect(isSlaBreached(complaint, deadlineMs + 1000)).toBe(true)
  })

  it('returns false when active ticket is on track', () => {
    const complaint = {
      status: 'Pending',
      category: 'Streetlight Issues',
      createdAt: baseTime,
    }
    expect(isSlaBreached(complaint, deadlineMs - 10000)).toBe(false)
  })

  it('returns false when ticket is Resolved even if past original SLA deadline', () => {
    const complaint = {
      status: 'Resolved',
      category: 'Streetlight Issues',
      createdAt: baseTime,
      resolvedAt: deadlineMs + 3600000,
    }
    expect(isSlaBreached(complaint, deadlineMs + 5000000)).toBe(false)
  })

  it('returns false when ticket is Rejected', () => {
    const complaint = {
      status: 'Rejected',
      category: 'Streetlight Issues',
      createdAt: baseTime,
    }
    expect(isSlaBreached(complaint, deadlineMs + 5000000)).toBe(false)
  })

  it('returns false for null or missing complaint or invalid date', () => {
    expect(isSlaBreached(null)).toBe(false)
    expect(isSlaBreached({})).toBe(false)
    expect(isSlaBreached({ createdAt: null })).toBe(false)
  })
})

describe('getSlaStatus and positional arguments', () => {
  const baseTime = 1740000000000

  it('supports computeSlaStatus with (category, createdAt, now) positional arguments', () => {
    const status = computeSlaStatus('Streetlight Issues', baseTime, baseTime + 30 * 3600000)
    expect(status.isBreached).toBe(true)
    expect(status.badgeText).toBe('SLA Breached')
  })

  it('getSlaStatus works identically as an alias', () => {
    const status = getSlaStatus('Streetlight Issues', baseTime, baseTime + 30 * 3600000)
    expect(status.isBreached).toBe(true)
    expect(status.badgeText).toBe('SLA Breached')
  })

  it('supports isSlaBreached with (category, createdAt, now) positional arguments', () => {
    expect(isSlaBreached('Streetlight Issues', baseTime, baseTime + 30 * 3600000)).toBe(true)
    expect(isSlaBreached('Streetlight Issues', baseTime, baseTime + 10 * 3600000)).toBe(false)
  })
})
