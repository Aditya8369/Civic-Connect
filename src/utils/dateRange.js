import { parseTimestamp } from '@/utils/sla'

/** Parses a YYYY-MM-DD value from <input type="date"> as local time. Returns null when empty/invalid. */
export function parseDateInput(value, { endOfDay = false } = {}) {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

/** True when the complaint was created inside the (inclusive) from/to day range. Empty bounds are open. */
export function matchesDateRange(complaint, dateFrom, dateTo) {
  const from = parseDateInput(dateFrom)
  const to = parseDateInput(dateTo, { endOfDay: true })
  if (!from && !to) return true
  const createdMs = parseTimestamp(complaint?.createdAt)
  if (createdMs === null) return false
  if (from && createdMs < from.getTime()) return false
  if (to && createdMs > to.getTime()) return false
  return true
}
