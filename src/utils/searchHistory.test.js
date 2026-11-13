// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getStorageKey,
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  MAX_RECENT_SEARCHES,
} from './searchHistory'

describe('Spotlight Recent Searches History (searchHistory.js)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('generates user-isolated storage keys', () => {
    expect(getStorageKey('citizen-1')).toBe('civic_spotlight_recent_searches_citizen-1')
    expect(getStorageKey('admin-99')).toBe('civic_spotlight_recent_searches_admin-99')
    expect(getStorageKey(null)).toBe('civic_spotlight_recent_searches_anonymous')
    expect(getStorageKey('')).toBe('civic_spotlight_recent_searches_anonymous')
  })

  it('saves and retrieves recent searches', () => {
    saveRecentSearch('user-1', 'pothole on main road')
    saveRecentSearch('user-1', 'broken streetlight')

    const searches = getRecentSearches('user-1')
    expect(searches).toEqual(['broken streetlight', 'pothole on main road'])
  })

  it('maintains correct ordering with most recent search at the top', () => {
    saveRecentSearch('user-1', 'first')
    saveRecentSearch('user-1', 'second')
    saveRecentSearch('user-1', 'third')

    const searches = getRecentSearches('user-1')
    expect(searches[0]).toBe('third')
    expect(searches[1]).toBe('second')
    expect(searches[2]).toBe('first')
  })

  it('avoids duplicate entries case-insensitively while updating position to top', () => {
    saveRecentSearch('user-1', 'Water Leakage')
    saveRecentSearch('user-1', 'Garbage Dump')
    saveRecentSearch('user-1', 'water leakage') // Case-insensitive duplicate

    const searches = getRecentSearches('user-1')
    expect(searches).toHaveLength(2)
    expect(searches[0]).toBe('water leakage')
    expect(searches[1]).toBe('Garbage Dump')
  })

  it('ignores empty, whitespace-only, or non-string queries', () => {
    saveRecentSearch('user-1', '')
    saveRecentSearch('user-1', '   ')
    saveRecentSearch('user-1', null)
    saveRecentSearch('user-1', undefined)
    saveRecentSearch('user-1', 12345)

    expect(getRecentSearches('user-1')).toEqual([])
  })

  it('trims leading and trailing whitespace from saved queries', () => {
    saveRecentSearch('user-1', '   ward 4 drainage   ')
    expect(getRecentSearches('user-1')).toEqual(['ward 4 drainage'])
  })

  it('caps history at MAX_RECENT_SEARCHES', () => {
    for (let i = 1; i <= MAX_RECENT_SEARCHES + 5; i++) {
      saveRecentSearch('user-1', `search query ${i}`)
    }

    const searches = getRecentSearches('user-1')
    expect(searches).toHaveLength(MAX_RECENT_SEARCHES)
    expect(searches[0]).toBe(`search query ${MAX_RECENT_SEARCHES + 5}`)
    expect(searches).not.toContain('search query 1')
  })

  it('removes an individual search term', () => {
    saveRecentSearch('user-1', 'alpha')
    saveRecentSearch('user-1', 'beta')
    saveRecentSearch('user-1', 'gamma')

    removeRecentSearch('user-1', 'beta')
    expect(getRecentSearches('user-1')).toEqual(['gamma', 'alpha'])
  })

  it('clears all history for a specific user', () => {
    saveRecentSearch('user-1', 'traffic light')
    saveRecentSearch('user-2', 'park maintenance')

    clearRecentSearches('user-1')
    expect(getRecentSearches('user-1')).toEqual([])
    expect(getRecentSearches('user-2')).toEqual(['park maintenance'])
  })

  it('handles invalid or corrupted localStorage JSON gracefully', () => {
    const key = getStorageKey('user-corrupted')
    localStorage.setItem(key, '{ invalid json corrupted string }')

    const searches = getRecentSearches('user-corrupted')
    expect(searches).toEqual([])
  })

  it('handles localStorage containing non-array data safely', () => {
    const key = getStorageKey('user-object')
    localStorage.setItem(key, JSON.stringify({ notAnArray: true }))

    const searches = getRecentSearches('user-object')
    expect(searches).toEqual([])
  })

  it('handles localStorage being unavailable or throwing exceptions gracefully', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage blocked')
    })

    expect(getRecentSearches('user-error')).toEqual([])
    getItemSpy.mockRestore()
  })
})
