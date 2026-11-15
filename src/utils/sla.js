// Service Level Agreement (SLA) calculations and helpers


export const SLA_DURATIONS_HOURS = {
  // Departments
  Roads: 7 * 24,
  Infrastructure: 7 * 24,
  Sanitation: 48,
  Electricity: 24,
  Water: 24,
  'Public Safety': 24,

  // Complaint categories
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

const NORMALIZED_DURATIONS = Object.entries(SLA_DURATIONS_HOURS).reduce(
  (acc, [key, val]) => {
    acc[key.toLowerCase()] = val
    return acc
  },
  {}
)

const isHindi = (language) => language === 'hi'

function formatResolvedDuration(hours, language = 'en') {
  if (hours < 1) {
    return isHindi(language) ? '1 घंटे से कम' : '<1 hour'
  }

  if (hours === 1) {
    return isHindi(language) ? '1 घंटा' : '1 hour'
  }

  return isHindi(language) ? `${hours} घंटे` : `${hours} hours`
}

/**
 * Safely parses various timestamp shapes into milliseconds.
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
 * Returns the SLA duration based on department or category.
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
 * Returns the target SLA deadline.
 */
export function getSlaTargetDate(createdAt, category, department) {
  const createdMs = parseTimestamp(createdAt)

  if (!createdMs) return null

  const durationHours = getSlaDurationHours(category, department)

  return new Date(createdMs + durationHours * 3600000)
}

/**
 * Formats duration in hours/days.
 */
export function formatDurationHours(totalHours, language = 'en') {
  const hindi = isHindi(language)

  if (totalHours < 1) {
    return hindi ? '<1 घंटा' : '<1h'
  }

  if (totalHours < 24) {
    return hindi ? `${totalHours} घंटे` : `${totalHours}h`
  }

  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24

  if (hindi) {
    return hours > 0
      ? `${days} दिन ${hours} घंटे`
      : `${days} दिन`
  }

  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

/**
 * Formats milliseconds remaining into a countdown string.
 */
export function formatRemainingTime(ms, language = 'en') {
  if (typeof ms !== 'number' || isNaN(ms)) return ''

  const absMs = Math.abs(ms)
  const totalSeconds = Math.floor(absMs / 1000)

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n) => String(n).padStart(2, '0')

  if (isHindi(language)) {
    const time = `${pad(hours)} घंटे ${pad(minutes)} मिनट ${pad(seconds)} सेकंड`
    return days > 0 ? `${days} दिन ${time}` : time
  }

  if (days > 0) {
    return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
  }

  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`
}

/**
 * Computes SLA metrics and badge presentation state.
 *
 * Existing calls remain compatible:
 * computeSlaStatus(complaint, now)
 * computeSlaStatus(category, createdAt, now)
 *
 * Optional language:
 * computeSlaStatus(complaint, now, undefined, 'hi')
 */
export function computeSlaStatus(
  complaintOrCategory,
  createdAtOrNow = Date.now(),
  maybeNow,
  language = 'en'
) {
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

  const hindi = isHindi(language)
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

  const durationHours = getSlaDurationHours(
    complaint.category,
    complaint.department
  )

  const targetMs = createdAtMs + durationHours * 3600000
  const targetDate = new Date(targetMs)
  const statusLower = (complaint.status || '').toLowerCase()

  // Resolved
  if (statusLower === 'resolved') {
    const resolvedAtMs =
      parseTimestamp(complaint.resolvedAt) ||
      parseTimestamp(complaint.updatedAt) ||
      now

    const resolutionDurationMs = Math.max(0, resolvedAtMs - createdAtMs)
    const resolutionHours = Math.floor(resolutionDurationMs / 3600000)
    const formattedTime = formatResolvedDuration(resolutionHours, language)

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
      badgeText: hindi
        ? `${formattedTime} में हल हुआ`
        : `Resolved in ${formattedTime}`,
      ariaLabel: hindi
        ? `शिकायत ${formattedTime} में हल हुई`
        : `Complaint resolved in ${formattedTime}`,
    }
  }

  // Rejected / Closed
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
      badgeText: null,
      ariaLabel: hindi ? 'शिकायत अस्वीकृत कर दी गई' : 'Complaint rejected',
    }
  }

  // Active statuses
  const remainingMs = targetMs - now

  if (remainingMs <= 0) {
    const overdueHours = Math.floor(Math.abs(remainingMs) / 3600000)

    const overdueText = overdueHours > 0
      ? hindi
        ? `${overdueHours} घंटे`
        : `${overdueHours} hours`
      : hindi
        ? 'एक घंटे से कम'
        : 'less than an hour'

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
      badgeText: hindi ? 'SLA समय-सीमा समाप्त' : 'SLA Breached',
      ariaLabel: hindi
        ? `SLA समय-सीमा समाप्त। ${overdueText} की देरी हो गई है।`
        : `SLA Breached. Overdue by ${overdueText}.`,
    }
  }

  const urgentThresholdMs = URGENT_THRESHOLD_HOURS * 3600000

  if (remainingMs <= urgentThresholdMs) {
    const remainingHours = Math.ceil(remainingMs / 3600000)

    const remainingText = hindi
      ? `${remainingHours} घंटे`
      : `${remainingHours} hour${remainingHours === 1 ? '' : 's'}`

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
      badgeText: hindi ? 'तत्काल - समय सीमा नज़दीक' : 'Urgent - Due Soon',
      ariaLabel: hindi
        ? `तत्काल चेतावनी। SLA समय-सीमा लगभग ${remainingText} में समाप्त होगी।`
        : `Urgent - SLA due soon. Approximately ${remainingText} remaining.`,
    }
  }

  // Normal / On track
  const remainingHours = Math.ceil(remainingMs / 3600000)
  const formattedLeft = formatDurationHours(remainingHours, language)

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
    badgeText: hindi
      ? `${formattedLeft} शेष`
      : `${formattedLeft} left`,
    ariaLabel: hindi
      ? `SLA समय-सीमा के अनुसार सब ठीक है। ${formattedLeft} शेष।`
      : `SLA target on track. ${formattedLeft} remaining.`,
  }
}

/**
 * Checks if a complaint is currently in breach of SLA.
 */
export function isSlaBreached(
  complaintOrCategory,
  createdAtOrNow = Date.now(),
  maybeNow
) {
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

  const durationHours = getSlaDurationHours(
    complaint.category,
    complaint.department
  )

  const targetMs = createdAtMs + durationHours * 3600000

  return targetMs - now <= 0
}

/**
 * Convenient alias for computeSlaStatus.
 */
export const getSlaStatus = computeSlaStatus
