/**
 * Versioned Business-Calendar SLA Clock & Policy Engine (Issue #282)
 *
 * Provides a pure, reproducible business-time calculator supporting:
 * - Versioned municipal policies
 * - Department weekly working schedules
 * - Overnight working intervals (e.g., 22:00 - 06:00)
 * - Holiday exclusions & timezone offsets
 * - Audited pause & resume extensions with bounded pause windows
 * - Idempotent escalation threshold evaluations per policy version
 */

export const DEFAULT_SLA_POLICY_VERSION = '2026.1'

/**
 * Standard municipal holiday list for year 2026 (ISO date strings YYYY-MM-DD).
 */
export const DEFAULT_MUNICIPAL_HOLIDAYS_2026 = Object.freeze([
  '2026-01-26', // Republic Day
  '2026-03-04', // Holi
  '2026-08-15', // Independence Day
  '2026-10-02', // Gandhi Jayanti
  '2026-11-08', // Diwali
  '2026-12-25', // Christmas
])

/**
 * Default standard working week: Mon-Fri 09:00-18:00 (9h/day), Sat 09:00-13:00 (4h), Sun Closed.
 */
export const DEFAULT_WEEKLY_SCHEDULE = Object.freeze({
  1: Object.freeze([{ start: '09:00', end: '18:00' }]),
  2: Object.freeze([{ start: '09:00', end: '18:00' }]),
  3: Object.freeze([{ start: '09:00', end: '18:00' }]),
  4: Object.freeze([{ start: '09:00', end: '18:00' }]),
  5: Object.freeze([{ start: '09:00', end: '18:00' }]),
  6: Object.freeze([{ start: '09:00', end: '13:00' }]),
  0: Object.freeze([]), // Closed on Sunday
})

/**
 * Department-specific target business hours and schedule overrides.
 */
export const DEFAULT_DEPARTMENT_TARGETS = Object.freeze({
  Roads: 40,
  Infrastructure: 40,
  Sanitation: 16,
  Electricity: 8,
  Water: 8,
  'Public Safety': 4,
})

export const DEFAULT_SLA_POLICY = Object.freeze({
  version: DEFAULT_SLA_POLICY_VERSION,
  timezone: 'UTC',
  weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
  holidays: DEFAULT_MUNICIPAL_HOLIDAYS_2026,
  departmentTargets: DEFAULT_DEPARTMENT_TARGETS,
  departmentSchedules: Object.freeze({
    // Public Safety runs 24x7 emergency response
    'Public Safety': Object.freeze({
      0: Object.freeze([{ start: '00:00', end: '24:00' }]),
      1: Object.freeze([{ start: '00:00', end: '24:00' }]),
      2: Object.freeze([{ start: '00:00', end: '24:00' }]),
      3: Object.freeze([{ start: '00:00', end: '24:00' }]),
      4: Object.freeze([{ start: '00:00', end: '24:00' }]),
      5: Object.freeze([{ start: '00:00', end: '24:00' }]),
      6: Object.freeze([{ start: '00:00', end: '24:00' }]),
    }),
    // Night Sanitation shifts (overnight 22:00 to 06:00)
    'Night Sanitation': Object.freeze({
      1: Object.freeze([{ start: '22:00', end: '06:00', overnight: true }]),
      2: Object.freeze([{ start: '22:00', end: '06:00', overnight: true }]),
      3: Object.freeze([{ start: '22:00', end: '06:00', overnight: true }]),
      4: Object.freeze([{ start: '22:00', end: '06:00', overnight: true }]),
      5: Object.freeze([{ start: '22:00', end: '06:00', overnight: true }]),
      6: Object.freeze([]),
      0: Object.freeze([]),
    }),
  }),
  maxPauseDurationHours: 72,
  maxTotalPauseHours: 168,
  escalationThresholds: Object.freeze([0.8, 1.0, 1.5]),
})

const POLICY_REGISTRY = new Map([
  [DEFAULT_SLA_POLICY_VERSION, DEFAULT_SLA_POLICY],
])

/**
 * Retrieves a registered policy by version or returns default.
 */
export function getSlaPolicy(version) {
  if (version && POLICY_REGISTRY.has(version)) {
    return POLICY_REGISTRY.get(version)
  }
  return DEFAULT_SLA_POLICY
}

/**
 * Registers an updated or historic versioned policy.
 */
export function registerSlaPolicy(policy) {
  if (!policy || !policy.version) {
    throw new Error('SLA Policy must specify a unique version identifier')
  }
  POLICY_REGISTRY.set(policy.version, Object.freeze({ ...DEFAULT_SLA_POLICY, ...policy }))
}

/**
 * Parses 'HH:MM' string into minutes since midnight (0-1440).
 */
export function parseTimeToMinutes(timeStr) {
  if (typeof timeStr !== 'string') return 0
  const [h, m] = timeStr.split(':').map((s) => parseInt(s, 10))
  return (h || 0) * 60 + (m || 0)
}

/**
 * Returns YYYY-MM-DD string for a UTC date.
 */
export function formatUtcDateKey(date) {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Checks if a given Date is listed as a holiday in the policy.
 */
export function isHoliday(date, policy = DEFAULT_SLA_POLICY) {
  const key = formatUtcDateKey(date)
  const holidays = policy.holidays || []
  return holidays.includes(key)
}

/**
 * Resolves the working intervals for a specific date and department.
 * Each interval is normalized into { startMinutes, endMinutes, isOvernight }.
 */
export function getDayWorkingIntervals(date, policy = DEFAULT_SLA_POLICY, department = '') {
  if (isHoliday(date, policy)) {
    return []
  }

  const dayOfWeek = date.getUTCDay()
  const deptSchedules = policy.departmentSchedules || {}
  const schedule = deptSchedules[department] || policy.weeklySchedule || DEFAULT_WEEKLY_SCHEDULE
  const rawIntervals = schedule[dayOfWeek] || []

  return rawIntervals.map((interval) => {
    const startMinutes = parseTimeToMinutes(interval.start)
    const endMinutes = interval.end === '24:00' ? 1440 : parseTimeToMinutes(interval.end)
    return {
      startMinutes,
      endMinutes,
      overnight: Boolean(interval.overnight || startMinutes > endMinutes),
    }
  })
}

/**
 * Checks whether a given timestamp (ms or Date) falls inside an active working window.
 */
export function isWorkingTime(dateOrMs, policy = DEFAULT_SLA_POLICY, department = '') {
  const d = new Date(dateOrMs)
  const currentMinutes = d.getUTCHours() * 60 + d.getUTCMinutes()

  // 1. Check intervals for today
  const todayIntervals = getDayWorkingIntervals(d, policy, department)
  for (const interval of todayIntervals) {
    if (!interval.overnight) {
      if (currentMinutes >= interval.startMinutes && currentMinutes < interval.endMinutes) {
        return true
      }
    } else {
      // Overnight starting today (e.g., 22:00 - 24:00)
      if (currentMinutes >= interval.startMinutes && currentMinutes < 1440) {
        return true
      }
    }
  }

  // 2. Check if yesterday had an overnight interval carrying into today
  const yesterday = new Date(d.getTime() - 86400000)
  const yesterdayIntervals = getDayWorkingIntervals(yesterday, policy, department)
  for (const interval of yesterdayIntervals) {
    if (interval.overnight) {
      if (currentMinutes < interval.endMinutes) {
        return true
      }
    }
  }

  return false
}

/**
 * Calculates reproducible UTC deadline by adding target business hours.
 * Walks minute-by-minute or window-by-window through valid working intervals.
 */
export function calculateBusinessDeadline(
  startDateOrMs,
  targetBusinessHours,
  policy = DEFAULT_SLA_POLICY,
  department = ''
) {
  const startMs = typeof startDateOrMs === 'number' ? startDateOrMs : new Date(startDateOrMs).getTime()
  if (isNaN(startMs)) {
    throw new Error('Invalid start timestamp provided to calculateBusinessDeadline')
  }

  let remainingMinutes = Math.round(targetBusinessHours * 60)
  if (remainingMinutes <= 0) {
    return new Date(startMs)
  }

  let current = new Date(startMs)

  // Maximum loop safety bound (365 days)
  const maxIterations = 365 * 24 * 60
  let iterations = 0

  while (remainingMinutes > 0 && iterations < maxIterations) {
    iterations++
    const dayOfWeek = current.getUTCDay()
    const currentMinutes = current.getUTCHours() * 60 + current.getUTCMinutes()

    // Find all applicable working windows that current time could fall into or wait for
    const dayIntervals = getDayWorkingIntervals(current, policy, department)

    // Check carry-over from yesterday's overnight interval
    const yesterday = new Date(current.getTime() - 86400000)
    const yesterdayIntervals = getDayWorkingIntervals(yesterday, policy, department)
    let activeInterval = null

    for (const yi of yesterdayIntervals) {
      if (yi.overnight && currentMinutes < yi.endMinutes) {
        activeInterval = { startMinutes: 0, endMinutes: yi.endMinutes }
        break
      }
    }

    if (!activeInterval) {
      for (const ti of dayIntervals) {
        if (!ti.overnight) {
          if (currentMinutes >= ti.startMinutes && currentMinutes < ti.endMinutes) {
            activeInterval = ti
            break
          }
        } else {
          if (currentMinutes >= ti.startMinutes) {
            activeInterval = { startMinutes: ti.startMinutes, endMinutes: 1440 }
            break
          }
        }
      }
    }

    if (activeInterval) {
      // We are inside an active window: consume up to remainingMinutes or window end
      const availableInWindow = activeInterval.endMinutes - currentMinutes
      const consume = Math.min(remainingMinutes, availableInWindow)
      current = new Date(current.getTime() + consume * 60000)
      remainingMinutes -= consume
    } else {
      // Outside active window: fast-forward to the next available working window
      let nextAvailableMs = null

      // Check later intervals today
      for (const ti of dayIntervals) {
        if (ti.startMinutes > currentMinutes) {
          const jumpMins = ti.startMinutes - currentMinutes
          nextAvailableMs = current.getTime() + jumpMins * 60000
          break
        }
      }

      if (nextAvailableMs === null) {
        // Fast-forward to midnight (start of next day)
        const midnightJumpMins = 1440 - currentMinutes
        current = new Date(current.getTime() + midnightJumpMins * 60000)
      } else {
        current = new Date(nextAvailableMs)
      }
    }
  }

  return current
}

/**
 * Calculates the exact business milliseconds elapsed between two timestamps.
 */
export function calculateBusinessDurationMs(
  startMs,
  endMs,
  policy = DEFAULT_SLA_POLICY,
  department = ''
) {
  if (endMs <= startMs) return 0

  let current = new Date(startMs)
  const targetEnd = new Date(endMs)
  let totalBusinessMs = 0

  while (current.getTime() < targetEnd.getTime()) {
    const currentMinutes = current.getUTCHours() * 60 + current.getUTCMinutes()
    const dayIntervals = getDayWorkingIntervals(current, policy, department)

    // Check carry-over from yesterday's overnight interval
    const yesterday = new Date(current.getTime() - 86400000)
    const yesterdayIntervals = getDayWorkingIntervals(yesterday, policy, department)
    let activeInterval = null

    for (const yi of yesterdayIntervals) {
      if (yi.overnight && currentMinutes < yi.endMinutes) {
        activeInterval = { startMinutes: 0, endMinutes: yi.endMinutes }
        break
      }
    }

    if (!activeInterval) {
      for (const ti of dayIntervals) {
        if (!ti.overnight) {
          if (currentMinutes >= ti.startMinutes && currentMinutes < ti.endMinutes) {
            activeInterval = ti
            break
          }
        } else {
          if (currentMinutes >= ti.startMinutes) {
            activeInterval = { startMinutes: ti.startMinutes, endMinutes: 1440 }
            break
          }
        }
      }
    }

    if (activeInterval) {
      const windowEndMs =
        new Date(current).setUTCHours(0, 0, 0, 0) + activeInterval.endMinutes * 60000
      const segmentEndMs = Math.min(windowEndMs, targetEnd.getTime())
      const duration = Math.max(0, segmentEndMs - current.getTime())
      totalBusinessMs += duration
      current = new Date(segmentEndMs)
    } else {
      // Jump to next window start or midnight
      let nextStartMs = null
      for (const ti of dayIntervals) {
        if (ti.startMinutes > currentMinutes) {
          nextStartMs = new Date(current).setUTCHours(0, 0, 0, 0) + ti.startMinutes * 60000
          break
        }
      }
      if (nextStartMs === null) {
        const midnight = new Date(current).setUTCHours(0, 0, 0, 0) + 86400000
        current = new Date(midnight)
      } else {
        current = new Date(nextStartMs)
      }
    }
  }

  return totalBusinessMs
}

/**
 * Calculates effective deadline taking into account audited pause and resume events.
 *
 * @param {Object} params
 * @param {Date|number} params.baseDeadline - Original calculated SLA target deadline
 * @param {Array<Object>} [params.pauses=[]] - Audited pause history [{ pausedAt, resumedAt, reason, remarks }]
 * @param {Object} [params.currentPause=null] - Currently active un-resumed pause { isPaused, pausedAt, reason }
 * @param {Date|number} [params.now=Date.now()] - Current evaluation timestamp
 * @param {Object} [params.policy=DEFAULT_SLA_POLICY] - Versioned policy
 * @param {string} [params.department=''] - Department for calendar intervals
 * @returns {Object} Effective SLA state & deadline
 */
export function calculateEffectiveDeadlineWithPauses({
  baseDeadline,
  pauses = [],
  currentPause = null,
  now = Date.now(),
  policy = DEFAULT_SLA_POLICY,
  department = '',
}) {
  const baseMs = baseDeadline instanceof Date ? baseDeadline.getTime() : new Date(baseDeadline).getTime()
  if (isNaN(baseMs)) {
    throw new Error('Valid baseDeadline is required')
  }

  const maxPauseMs = (policy.maxPauseDurationHours || 72) * 3600000
  let totalPauseExtensionMs = 0
  const processedPauses = []

  // 1. Process closed historical pauses
  for (const p of pauses) {
    const pStart = p.pausedAt?.toMillis?.() ?? (typeof p.pausedAt === 'number' ? p.pausedAt : new Date(p.pausedAt).getTime())
    const pEnd = p.resumedAt?.toMillis?.() ?? (typeof p.resumedAt === 'number' ? p.resumedAt : new Date(p.resumedAt).getTime())

    if (pStart && pEnd && pEnd > pStart) {
      const rawDuration = pEnd - pStart
      const clampedDuration = Math.min(rawDuration, maxPauseMs)
      totalPauseExtensionMs += clampedDuration
      processedPauses.push({
        pausedAt: new Date(pStart).toISOString(),
        resumedAt: new Date(pEnd).toISOString(),
        rawDurationMs: rawDuration,
        appliedExtensionMs: clampedDuration,
        reason: p.reason || 'Administrative pause',
        remarks: p.remarks || '',
      })
    }
  }

  // 2. Check active pause state
  const isCurrentlyPaused = Boolean(currentPause?.isPaused)
  let activePauseInfo = null

  if (isCurrentlyPaused && currentPause?.pausedAt) {
    const pauseStartMs = currentPause.pausedAt?.toMillis?.() ??
      (typeof currentPause.pausedAt === 'number' ? currentPause.pausedAt : new Date(currentPause.pausedAt).getTime())

    const currentPauseDuration = Math.max(0, now - pauseStartMs)
    const clampedCurrentPause = Math.min(currentPauseDuration, maxPauseMs)

    activePauseInfo = {
      isPaused: true,
      pausedAt: new Date(pauseStartMs).toISOString(),
      currentDurationMs: currentPauseDuration,
      projectedExtensionMs: clampedCurrentPause,
      reason: currentPause.reason || 'Pending citizen response',
      remarks: currentPause.remarks || '',
      pausedBy: currentPause.pausedBy || null,
    }

    // While paused, the effective deadline advances by the ongoing pause duration
    totalPauseExtensionMs += clampedCurrentPause
  }

  const effectiveDeadline = new Date(baseMs + totalPauseExtensionMs)

  return {
    baseDeadline: new Date(baseMs),
    effectiveDeadline,
    totalPauseExtensionMs,
    totalPauseHours: Math.round((totalPauseExtensionMs / 3600000) * 10) / 10,
    isPaused: isCurrentlyPaused,
    activePause: activePauseInfo,
    pauseHistory: processedPauses,
    policyVersion: policy.version,
  }
}

/**
 * Checks SLA escalation eligibility idempotently per threshold and policy version.
 *
 * @param {Object} params
 * @param {Object} params.complaint - Complaint document data
 * @param {number} [params.now=Date.now()] - Current evaluation timestamp
 * @param {Object} [params.policy=DEFAULT_SLA_POLICY] - Applied policy
 * @returns {Array<Object>} List of newly eligible escalations to record
 */
export function checkSlaEscalationEligibility({
  complaint,
  now = Date.now(),
  policy = DEFAULT_SLA_POLICY,
}) {
  if (!complaint || !complaint.createdAt) return []

  const createdMs = complaint.createdAt?.toMillis?.() ??
    (typeof complaint.createdAt === 'number' ? complaint.createdAt : new Date(complaint.createdAt).getTime())
  if (!createdMs || isNaN(createdMs)) return []

  // Skip terminal complaints
  const statusLower = (complaint.status || '').toLowerCase()
  if (['resolved', 'rejected', 'merged - duplicate'].includes(statusLower)) {
    return []
  }

  // If currently paused, pause stops SLA clock from ticking toward escalation
  if (complaint.slaPause?.isPaused === true) {
    return []
  }

  const department = complaint.department || ''
  const targetHours = policy.departmentTargets?.[department] ||
    policy.departmentTargets?.[complaint.category] ||
    DEFAULT_SLA_POLICY.departmentTargets.Roads

  const baseDeadline = calculateBusinessDeadline(createdMs, targetHours, policy, department)
  const effectiveResult = calculateEffectiveDeadlineWithPauses({
    baseDeadline,
    pauses: complaint.slaPauseHistory || [],
    currentPause: complaint.slaPause,
    now,
    policy,
    department,
  })

  const targetDurationMs = targetHours * 3600000
  const elapsedMs = Math.max(0, now - createdMs - effectiveResult.totalPauseExtensionMs)
  const ratio = targetDurationMs > 0 ? elapsedMs / targetDurationMs : 1.0

  const thresholds = policy.escalationThresholds || [0.8, 1.0, 1.5]
  const existingEscalations = complaint.slaEscalations || {}
  const newlyEligible = []

  for (const threshold of thresholds) {
    const thresholdKey = `tier_${String(threshold).replace('.', '_')}`

    if (ratio >= threshold) {
      const record = existingEscalations[thresholdKey]
      // Ensure one escalation per threshold and policy version
      if (!record || record.policyVersion !== policy.version) {
        newlyEligible.push({
          thresholdKey,
          threshold,
          ratio,
          policyVersion: policy.version,
          escalatedAt: new Date(now).toISOString(),
          effectiveDeadline: effectiveResult.effectiveDeadline.toISOString(),
        })
      }
    }
  }

  return newlyEligible
}
