/**
 * Formats a timestamp into clean relative time ("Just now", "10m ago", "Yesterday", etc.).
 * Supports Firestore Timestamp, JavaScript Date, Unix timestamp (ms or s), and ISO strings.
 *
 * @param {any} timestamp
 * @param {Date} [now=new Date()]
 * @returns {string}
 */
export function formatRelativeTime(timestamp, now = new Date()) {
  if (!timestamp) return ''

  let date
  if (typeof timestamp?.toDate === 'function') {
    date = timestamp.toDate()
  } else if (timestamp instanceof Date) {
    date = timestamp
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp < 1e11 ? timestamp * 1000 : timestamp)
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp)
  }

  if (!date || isNaN(date.getTime())) return ''

  const diffMs = now.getTime() - date.getTime()

  // Future dates or tiny drift
  if (diffMs < 0) return 'Just now'

  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHours = Math.floor(diffMin / 60)

  if (diffSec < 60) {
    return 'Just now'
  }

  if (diffMin < 60) {
    return `${diffMin}m ago`
  }

  // Check if calendar day is same as now
  const isSameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  if (diffHours < 24 && isSameDay) {
    return `${diffHours}h ago`
  }

  // Check if calendar day is yesterday
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()

  if (isYesterday) {
    return 'Yesterday'
  }

  const currentYear = now.getFullYear()
  const dateYear = date.getFullYear()

  if (currentYear === dateYear) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

