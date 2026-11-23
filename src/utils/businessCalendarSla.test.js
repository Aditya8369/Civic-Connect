// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SLA_POLICY,
  DEFAULT_SLA_POLICY_VERSION,
  getSlaPolicy,
  registerSlaPolicy,
  isHoliday,
  isWorkingTime,
  calculateBusinessDeadline,
  calculateBusinessDurationMs,
  calculateEffectiveDeadlineWithPauses,
  checkSlaEscalationEligibility,
} from './businessCalendarSla'

describe('businessCalendarSla (Issue #282)', () => {
  describe('Policy management and versioning', () => {
    it('provides DEFAULT_SLA_POLICY with valid 2026 version', () => {
      const policy = getSlaPolicy(DEFAULT_SLA_POLICY_VERSION)
      expect(policy.version).toBe(DEFAULT_SLA_POLICY_VERSION)
      expect(policy.weeklySchedule[1]).toBeDefined()
      expect(policy.holidays).toContain('2026-01-26')
    })

    it('allows registering and retrieving custom versioned policies', () => {
      registerSlaPolicy({
        version: '2026.2-summer',
        maxPauseDurationHours: 48,
      })
      const retrieved = getSlaPolicy('2026.2-summer')
      expect(retrieved.version).toBe('2026.2-summer')
      expect(retrieved.maxPauseDurationHours).toBe(48)
    })
  })

  describe('Holidays and working time detection', () => {
    it('identifies declared municipal holidays', () => {
      // 2026-01-26 is Republic Day
      const repDay = new Date('2026-01-26T10:00:00Z')
      expect(isHoliday(repDay, DEFAULT_SLA_POLICY)).toBe(true)

      // Normal Tuesday
      const normalDay = new Date('2026-01-27T10:00:00Z')
      expect(isHoliday(normalDay, DEFAULT_SLA_POLICY)).toBe(false)
    })

    it('detects working time vs off-hours during standard work days', () => {
      // Tuesday 10:00 UTC -> inside 09:00 - 18:00
      expect(isWorkingTime(new Date('2026-02-03T10:00:00Z'), DEFAULT_SLA_POLICY)).toBe(true)

      // Tuesday 07:00 UTC -> before 09:00
      expect(isWorkingTime(new Date('2026-02-03T07:00:00Z'), DEFAULT_SLA_POLICY)).toBe(false)

      // Tuesday 19:00 UTC -> after 18:00
      expect(isWorkingTime(new Date('2026-02-03T19:00:00Z'), DEFAULT_SLA_POLICY)).toBe(false)

      // Sunday 12:00 UTC -> closed
      expect(isWorkingTime(new Date('2026-02-01T12:00:00Z'), DEFAULT_SLA_POLICY)).toBe(false)
    })

    it('respects 24x7 schedule for Public Safety department', () => {
      // Sunday midnight for Public Safety is working time
      expect(
        isWorkingTime(new Date('2026-02-01T02:00:00Z'), DEFAULT_SLA_POLICY, 'Public Safety')
      ).toBe(true)
    })

    it('handles overnight shift intervals (22:00 - 06:00)', () => {
      // Monday 23:00 UTC -> active overnight interval
      expect(
        isWorkingTime(new Date('2026-02-02T23:00:00Z'), DEFAULT_SLA_POLICY, 'Night Sanitation')
      ).toBe(true)

      // Tuesday 03:00 UTC -> carry-over from Monday night
      expect(
        isWorkingTime(new Date('2026-02-03T03:00:00Z'), DEFAULT_SLA_POLICY, 'Night Sanitation')
      ).toBe(true)

      // Tuesday 12:00 UTC -> daytime is off for night shift
      expect(
        isWorkingTime(new Date('2026-02-03T12:00:00Z'), DEFAULT_SLA_POLICY, 'Night Sanitation')
      ).toBe(false)
    })
  })

  describe('calculateBusinessDeadline', () => {
    it('computes exact UTC deadline within same working day', () => {
      // Monday 2026-02-02 10:00 UTC + 4 business hours = Monday 14:00 UTC
      const start = new Date('2026-02-02T10:00:00Z')
      const deadline = calculateBusinessDeadline(start, 4, DEFAULT_SLA_POLICY)
      expect(deadline.toISOString()).toBe('2026-02-02T14:00:00.000Z')
    })

    it('carries over weekend into Saturday and Monday', () => {
      // Friday 2026-02-06 16:00 UTC + 4 business hours:
      // Friday 16:00 - 18:00 (2 hours consumed)
      // Saturday 09:00 - 11:00 (remaining 2 hours consumed)
      const start = new Date('2026-02-06T16:00:00Z')
      const deadline = calculateBusinessDeadline(start, 4, DEFAULT_SLA_POLICY)
      expect(deadline.toISOString()).toBe('2026-02-07T11:00:00.000Z')
    })

    it('skips Sunday completely and resumes Monday 09:00', () => {
      // Friday 2026-02-06 17:00 UTC + 6 business hours:
      // Friday 17:00 - 18:00 (1 hour)
      // Saturday 09:00 - 13:00 (4 hours, total 5 hours)
      // Sunday: closed
      // Monday 2026-02-09: remaining 1 hour -> Monday 10:00 UTC
      const start = new Date('2026-02-06T17:00:00Z')
      const deadline = calculateBusinessDeadline(start, 6, DEFAULT_SLA_POLICY)
      expect(deadline.toISOString()).toBe('2026-02-09T10:00:00.000Z')
    })

    it('skips municipal holidays', () => {
      // Friday 2026-01-23 17:00 UTC + 6 business hours:
      // Friday 17:00 - 18:00 (1h)
      // Saturday 09:00 - 13:00 (4h)
      // Sunday 2026-01-25: closed
      // Monday 2026-01-26: Republic Day (Holiday) -> skipped
      // Tuesday 2026-01-27: remaining 1 hour -> Tuesday 10:00 UTC
      const start = new Date('2026-01-23T17:00:00Z')
      const deadline = calculateBusinessDeadline(start, 6, DEFAULT_SLA_POLICY)
      expect(deadline.toISOString()).toBe('2026-01-27T10:00:00.000Z')
    })

    it('handles overnight shifts accurately', () => {
      // Monday 2026-02-02 23:00 UTC + 5 business hours on Night Sanitation (22:00 - 06:00):
      // Monday 23:00 - 24:00 (1h)
      // Tuesday 00:00 - 04:00 (4h) -> Tuesday 04:00 UTC
      const start = new Date('2026-02-02T23:00:00Z')
      const deadline = calculateBusinessDeadline(start, 5, DEFAULT_SLA_POLICY, 'Night Sanitation')
      expect(deadline.toISOString()).toBe('2026-02-03T04:00:00.000Z')
    })
  })

  describe('calculateBusinessDurationMs', () => {
    it('measures only active working hours between two dates', () => {
      // Monday 08:00 to Monday 12:00 (work starts at 09:00, so 3h = 10,800,000 ms)
      const start = new Date('2026-02-02T08:00:00Z').getTime()
      const end = new Date('2026-02-02T12:00:00Z').getTime()
      const durationMs = calculateBusinessDurationMs(start, end, DEFAULT_SLA_POLICY)
      expect(durationMs).toBe(3 * 3600000)
    })
  })

  describe('calculateEffectiveDeadlineWithPauses', () => {
    it('extends base deadline by applied pause history', () => {
      const baseDeadline = new Date('2026-02-04T12:00:00Z')
      const pauses = [
        {
          pausedAt: new Date('2026-02-02T12:00:00Z').getTime(),
          resumedAt: new Date('2026-02-02T16:00:00Z').getTime(), // 4h pause
          reason: 'Awaiting citizen part delivery',
        },
      ]

      const result = calculateEffectiveDeadlineWithPauses({
        baseDeadline,
        pauses,
        currentPause: null,
      })

      expect(result.isPaused).toBe(false)
      expect(result.totalPauseHours).toBe(4)
      expect(result.effectiveDeadline.toISOString()).toBe('2026-02-04T16:00:00.000Z')
    })

    it('clamps pause extension to policy maxPauseDurationHours', () => {
      const baseDeadline = new Date('2026-02-04T12:00:00Z')
      const pauses = [
        {
          pausedAt: new Date('2026-02-01T00:00:00Z').getTime(),
          resumedAt: new Date('2026-02-06T00:00:00Z').getTime(), // 120h pause (> 72h max)
          reason: 'Material shortage',
        },
      ]

      const result = calculateEffectiveDeadlineWithPauses({
        baseDeadline,
        pauses,
        currentPause: null,
      })

      expect(result.totalPauseHours).toBe(72) // Clamped to 72h
      expect(result.effectiveDeadline.toISOString()).toBe('2026-02-07T12:00:00.000Z')
    })

    it('projects deadline extension while actively paused', () => {
      const baseDeadline = new Date('2026-02-04T12:00:00Z')
      const pausedAt = new Date('2026-02-03T10:00:00Z').getTime()
      const now = pausedAt + 2 * 3600000 // 2h ongoing

      const result = calculateEffectiveDeadlineWithPauses({
        baseDeadline,
        pauses: [],
        currentPause: {
          isPaused: true,
          pausedAt,
          reason: 'Access permit pending',
        },
        now,
      })

      expect(result.isPaused).toBe(true)
      expect(result.activePause).toBeDefined()
      expect(result.activePause.reason).toBe('Access permit pending')
      expect(result.totalPauseHours).toBe(2)
      expect(result.effectiveDeadline.toISOString()).toBe('2026-02-04T14:00:00.000Z')
    })
  })

  describe('checkSlaEscalationEligibility', () => {
    it('returns newly crossed escalation tiers idempotently per policy version', () => {
      const createdMs = new Date('2026-02-02T09:00:00Z').getTime()
      // Sanitation target is 16h (57,600,000 ms)
      // 80% threshold is at 12.8h (46,080,000 ms)
      const nowAt85Pct = createdMs + 13.6 * 3600000

      const complaint = {
        id: 'cmp-sla-1',
        status: 'In Progress',
        department: 'Sanitation',
        createdAt: createdMs,
        slaEscalations: {},
      }

      const eligible = checkSlaEscalationEligibility({
        complaint,
        now: nowAt85Pct,
      })

      expect(eligible).toHaveLength(1)
      expect(eligible[0].thresholdKey).toBe('tier_0_8')
      expect(eligible[0].policyVersion).toBe(DEFAULT_SLA_POLICY_VERSION)

      // Retry / subsequent evaluation with existing escalation recorded
      const updatedComplaint = {
        ...complaint,
        slaEscalations: {
          tier_0_8: {
            policyVersion: DEFAULT_SLA_POLICY_VERSION,
            escalatedAt: eligible[0].escalatedAt,
          },
        },
      }

      const retried = checkSlaEscalationEligibility({
        complaint: updatedComplaint,
        now: nowAt85Pct + 1000,
      })

      // Must be empty (no duplicate escalation for same policy version)
      expect(retried).toHaveLength(0)
    })

    it('does not escalate while complaint is in paused state', () => {
      const createdMs = new Date('2026-02-02T09:00:00Z').getTime()
      const complaint = {
        id: 'cmp-paused',
        status: 'In Progress',
        department: 'Sanitation',
        createdAt: createdMs,
        slaPause: { isPaused: true, pausedAt: createdMs },
      }

      const eligible = checkSlaEscalationEligibility({
        complaint,
        now: createdMs + 50 * 3600000,
      })
      expect(eligible).toHaveLength(0)
    })
  })
})
