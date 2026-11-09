// Service Level Agreement (SLA) calculations and helpers

export const SLA_DURATIONS_HOURS = {
  // Departments
  Roads: 7 * 24, // 168 hours (7 days)
  Infrastructure: 7 * 24,
  Sanitation: 48,
  Electricity: 24,
  Water: 24,
  'Public Safety': 24,

  // Complaint categories (fallback when department is not yet assigned)
  'Potholes & Road Damage': 7 * 24,
  'Streetlight Issues': 24,
  'Water Leakage': 24,
  'Garbage & Sanitation': 48,
  'Noise Pollution': 24,
  'Illegal Construction': 48,
  'Traffic Issues': 24,
  Other: 48,
}

export const DEFAULT_SLA_HOURS = 48
export const URGENT_THRESHOLD_HOURS = 6

const NORMALIZED_DURATIONS = Object.entries(SLA_DURATIONS_HOURS).reduce((acc, [key, val]) => {
  acc[key.toLowerCase()] = val
  return acc
}, {})

/**
 * Safely parses various timestamp shapes (Firestore Timestamp, JS Date, number, string)
 * into milliseconds since epoch. Returns null if invalid.
 */
export function parseTimestamp(ts) {
  if (!ts) return null
  if (typeof ts?.toDate === 'function') {
    try {
      const d = ts.toDate()
      return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : null
    } catch {
      return null
    }
  }
  if (ts instanceof Date) {
    return !isNaN(ts.getTime()) ? ts.getTime() : null
  }
  if (typeof ts?.seconds === 'number') {
    return ts.seconds * 1000
  }
  if (typeof ts === 'number') {
    return !isNaN(ts) && ts > 0 ? ts : null
  }
  if (typeof ts === 'string') {
    const parsed = new Date(ts).getTime()
    return !isNaN(parsed) ? parsed : null
  }
  return null
}

/**
 * Returns the SLA duration in hours based on department (priority) or category.
 * Performs case-insensitive matching for maximum reliability.
 */
export function getSlaDurationHours(category, department) {
  if (department && typeof department === 'string') {
    const key = department.trim().toLowerCase()
    if (typeof NORMALIZED_DURATIONS[key] === 'number') {
      return NORMALIZED_DURATIONS[key]
    }
  }
  if (category && typeof category === 'string') {
    const key = category.trim().toLowerCase()
    if (typeof NORMALIZED_DURATIONS[key] === 'number') {
      return NORMALIZED_DURATIONS[key]
    }
  }
  return DEFAULT_SLA_HOURS
}

/**
 * Returns the target SLA deadline Date object or null if createdAt is invalid.
 */
export function getSlaTargetDate(createdAt, category, department) {
  const createdMs = parseTimestamp(createdAt)
  if (!createdMs) return null
  const durationHours = getSlaDurationHours(category, department)
  return new Date(createdMs + durationHours * 3600000)
}

/**
 * Formats duration in hours/days into a human-readable string.
 */
export function formatDurationHours(totalHours) {
  if (totalHours < 1) return '<1h'
  if (totalHours < 24) return `${totalHours}h`
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

/**
 * Formats milliseconds remaining into a precise countdown string (e.g. "04h 12m 30s" or "2d 04h 12m 30s").
 */
export function formatRemainingTime(ms) {
  if (typeof ms !== 'number' || isNaN(ms)) return ''
  const absMs = Math.abs(ms)
  const totalSeconds = Math.floor(absMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n) => String(n).padStart(2, '0')

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
  }
  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
}

/**
 * Computes full SLA metrics and badge presentation state for a complaint.
 * Supports calling with a complaint object: computeSlaStatus(complaint, now)
 * or positional arguments: computeSlaStatus(category, createdAt, now)
 */
export function computeSlaStatus(complaintOrCategory, createdAtOrNow = Date.now(), maybeNow) {
  let complaint
  let now

  if (typeof complaintOrCategory === 'string') {
    complaint = {
      category: complaintOrCategory,
      createdAt: createdAtOrNow,
    }
    now = typeof maybeNow === 'number' ? maybeNow : Date.now()
  } else {
    complaint = complaintOrCategory
    now = typeof createdAtOrNow === 'number' ? createdAtOrNow : Date.now()
  }

  if (!complaint) return null

  const createdAtMs = parseTimestamp(complaint.createdAt)
  if (!createdAtMs) {
    return {
      isValid: false,
      badgeText: null,
      badgeVariant: 'secondary',
      isBreached: false,
      isDueSoon: false,
      isResolved: false,
      pulsing: false,
      targetDate: null,
      remainingMs: null,
    }
  }

  const durationHours = getSlaDurationHours(complaint.category, complaint.department)
  const targetMs = createdAtMs + durationHours * 3600000
  const targetDate = new Date(targetMs)

  const statusLower = (complaint.status || '').toLowerCase()

  // Status: Resolved
  if (statusLower === 'resolved') {
    const resolvedAtMs =
      parseTimestamp(complaint.resolvedAt) ||
      parseTimestamp(complaint.updatedAt) ||
      now
    const resolutionDurationMs = Math.max(0, resolvedAtMs - createdAtMs)
    const resolutionHours = Math.floor(resolutionDurationMs / 3600000)
    const formattedTime =
      resolutionHours < 1
        ? '<1 hour'
        : resolutionHours === 1
          ? '1 hour'
          : `${resolutionHours} hours`

    return {
      isValid: true,
      isResolved: true,
      isBreached: false,
      isDueSoon: false,
      pulsing: false,
      targetDate,
      remainingMs: 0,
      resolutionHours,
      badgeVariant: 'success',
      badgeText: `Resolved in ${formattedTime}`,
      ariaLabel: `Complaint resolved in ${formattedTime}`,
    }
  }

  // Status: Rejected / Closed without resolution
  if (statusLower === 'rejected') {
    return {
      isValid: true,
      isResolved: false,
      isBreached: false,
      isDueSoon: false,
      isRejected: true,
      pulsing: false,
      targetDate,
      remainingMs: null,
      badgeVariant: 'secondary',
      badgeText: null, // No active countdown required
      ariaLabel: 'Complaint rejected',
    }
  }

  // Active statuses: Pending, In Progress, Reopened
  const remainingMs = targetMs - now

  if (remainingMs <= 0) {
    // Breached SLA
    const overdueHours = Math.floor(Math.abs(remainingMs) / 3600000)
    return {
      isValid: true,
      isResolved: false,
      isBreached: true,
      isDueSoon: false,
      pulsing: true,
      targetDate,
      remainingMs,
      overdueHours,
      badgeVariant: 'destructive',
      badgeText: 'SLA Breached',
      ariaLabel: `SLA Breached. Overdue by ${overdueHours > 0 ? `${overdueHours} hours` : 'less than an hour'}.`,
    }
  }

  const urgentThresholdMs = URGENT_THRESHOLD_HOURS * 3600000
  if (remainingMs <= urgentThresholdMs) {
    // Urgent - Due Soon (<= 6 hours)
    const remainingHours = Math.ceil(remainingMs / 3600000)
    return {
      isValid: true,
      isResolved: false,
      isBreached: false,
      isDueSoon: true,
      pulsing: false,
      targetDate,
      remainingMs,
      remainingHours,
      badgeVariant: 'warning',
      badgeText: 'Urgent - Due Soon',
      ariaLabel: `Urgent - SLA due soon. Approximately ${remainingHours} hour${remainingHours === 1 ? '' : 's'} remaining.`,
    }
  }

  // Normal / On track (> 6 hours)
  const remainingHours = Math.ceil(remainingMs / 3600000)
  const formattedLeft = formatDurationHours(remainingHours)
  return {
    isValid: true,
    isResolved: false,
    isBreached: false,
    isDueSoon: false,
    pulsing: false,
    targetDate,
    remainingMs,
    remainingHours,
    badgeVariant: 'outline',
    badgeText: `${formattedLeft} left`,
    ariaLabel: `SLA target on track. ${formattedLeft} remaining.`,
  }
}

/**
 * Checks if a complaint is currently in breach of SLA.
 * Supports calling with a complaint object: isSlaBreached(complaint, now)
 * or positional arguments: isSlaBreached(category, createdAt, now)
 */
export function isSlaBreached(complaintOrCategory, createdAtOrNow = Date.now(), maybeNow) {
  let complaint
  let now

  if (typeof complaintOrCategory === 'string') {
    complaint = {
      category: complaintOrCategory,
      createdAt: createdAtOrNow,
    }
    now = typeof maybeNow === 'number' ? maybeNow : Date.now()
  } else {
    complaint = complaintOrCategory
    now = typeof createdAtOrNow === 'number' ? createdAtOrNow : Date.now()
  }

  const statusLower = (complaint?.status || '').toLowerCase()
  if (!complaint || statusLower === 'resolved' || statusLower === 'rejected') {
    return false
  }
  const createdAtMs = parseTimestamp(complaint.createdAt)
  if (!createdAtMs) return false
  const durationHours = getSlaDurationHours(complaint.category, complaint.department)
  const targetMs = createdAtMs + durationHours * 3600000
  return (targetMs - now) <= 0
}

/**
 * Convenient alias for computeSlaStatus.
 */
export const getSlaStatus = computeSlaStatus


