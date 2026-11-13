/**
 * Utility functions for managing Spotlight recent search history in localStorage.
 * Supports user isolation, deduplication, safe JSON parsing, and history caps.
 */

export const RECENT_SEARCHES_KEY_PREFIX = 'civic_spotlight_recent_searches'
export const MAX_RECENT_SEARCHES = 8

/**
 * Returns the localStorage key scoped to the specific user.
 * @param {string|null|undefined} userId
 * @returns {string}
 */
export function getStorageKey(userId) {
  const safeId = userId && typeof userId === 'string' && userId.trim() ? userId.trim() : 'anonymous'
  return `${RECENT_SEARCHES_KEY_PREFIX}_${safeId}`
}

/**
 * Retrieves recent search queries from localStorage safely.
 * @param {string|null|undefined} userId
 * @returns {string[]}
 */
export function getRecentSearches(userId) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return []
    }
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0)
  } catch (error) {
    console.warn('Failed to parse recent searches from localStorage:', error)
    return []
  }
}

/**
 * Saves a successful search query to localStorage.
 * Removes case-insensitive duplicates, places the latest search on top, and caps size.
 * @param {string|null|undefined} userId
 * @param {string} query
 * @returns {string[]} Updated list of recent searches
 */
export function saveRecentSearch(userId, query) {
  if (!query || typeof query !== 'string') return getRecentSearches(userId)
  const trimmed = query.trim()
  if (!trimmed) return getRecentSearches(userId)

  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return []
    }
    const current = getRecentSearches(userId)
    // Filter out existing duplicates case-insensitively
    const deduplicated = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())
    const updated = [trimmed, ...deduplicated].slice(0, MAX_RECENT_SEARCHES)
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(updated))
    return updated
  } catch (error) {
    console.warn('Failed to save recent search to localStorage:', error)
    return []
  }
}

/**
 * Removes a specific search term from localStorage.
 * @param {string|null|undefined} userId
 * @param {string} queryToRemove
 * @returns {string[]} Updated list of recent searches
 */
export function removeRecentSearch(userId, queryToRemove) {
  if (!queryToRemove || typeof queryToRemove !== 'string') return getRecentSearches(userId)
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return []
    }
    const current = getRecentSearches(userId)
    const target = queryToRemove.toLowerCase()
    const updated = current.filter((item) => item.toLowerCase() !== target)
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(updated))
    return updated
  } catch (error) {
    console.warn('Failed to remove recent search from localStorage:', error)
    return []
  }
}

/**
 * Clears all recent searches for a user from localStorage.
 * @param {string|null|undefined} userId
 * @returns {string[]} Empty array
 */
export function clearRecentSearches(userId) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(getStorageKey(userId))
    }
    return []
  } catch (error) {
    console.warn('Failed to clear recent searches from localStorage:', error)
    return []
  }
}

