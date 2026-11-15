export const EMERGENCY_BANNER_DISMISS_KEY =
  'civic-connect:emergency-broadcast:dismissed'

/**
 * Every publish creates a new document, so the ID uniquely identifies one
 * alert. A newer alert therefore automatically re-appears after dismissal.
 */
export function getBroadcastDismissKey(broadcast) {
  if (!broadcast) return ''
  return broadcast.id || `${broadcast.title || ''}:${broadcast.message || ''}`
}

export function readDismissedBroadcastKey() {
  try {
    return localStorage.getItem(EMERGENCY_BANNER_DISMISS_KEY) || ''
  } catch {
    return ''
  }
}

export function persistDismissedBroadcastKey(key) {
  try {
    localStorage.setItem(EMERGENCY_BANNER_DISMISS_KEY, key)
  } catch {
    // Storage can be unavailable in private or sandboxed contexts.
  }
}
