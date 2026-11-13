import { describe, expect, it } from 'vitest'
import { NOTIFICATION_TABS, matchesCategory } from './notificationCategories'

describe('notificationCategories', () => {
  it('defines the 4 required category tabs', () => {
    expect(NOTIFICATION_TABS).toHaveLength(4)
    expect(NOTIFICATION_TABS.map((t) => t.id)).toEqual(['all', 'status', 'announcement', 'mention'])
    expect(NOTIFICATION_TABS.map((t) => t.label)).toEqual([
      'All',
      'Status Updates',
      'Announcements',
      'Mentions',
    ])
  })

  describe('matchesCategory', () => {
    it('returns false for null/undefined notification', () => {
      expect(matchesCategory(null, 'all')).toBe(false)
      expect(matchesCategory(undefined, 'status')).toBe(false)
    })

    it('matches everything under "all"', () => {
      expect(matchesCategory({ type: 'status_update' }, 'all')).toBe(true)
      expect(matchesCategory({ type: 'announcement' }, 'all')).toBe(true)
      expect(matchesCategory({ type: 'mention' }, 'all')).toBe(true)
      expect(matchesCategory({ type: 'unknown_type' }, 'all')).toBe(true)
    })

    it('matches status updates correctly', () => {
      expect(matchesCategory({ type: 'status_update' }, 'status')).toBe(true)
      expect(matchesCategory({ type: 'department_assigned' }, 'status')).toBe(true)
      expect(matchesCategory({ type: 'new_complaint' }, 'status')).toBe(true)
      expect(matchesCategory({ category: 'status' }, 'status')).toBe(true)
      expect(matchesCategory({ type: 'announcement' }, 'status')).toBe(false)
      expect(matchesCategory({ type: 'mention' }, 'status')).toBe(false)
    })

    it('matches announcements correctly', () => {
      expect(matchesCategory({ type: 'announcement' }, 'announcement')).toBe(true)
      expect(matchesCategory({ type: 'broadcast' }, 'announcement')).toBe(true)
      expect(matchesCategory({ category: 'announcement' }, 'announcement')).toBe(true)
      expect(matchesCategory({ type: 'status_update' }, 'announcement')).toBe(false)
    })

    it('matches mentions correctly', () => {
      expect(matchesCategory({ type: 'mention' }, 'mention')).toBe(true)
      expect(matchesCategory({ category: 'mention' }, 'mention')).toBe(true)
      expect(matchesCategory({ type: 'status_update' }, 'mention')).toBe(false)
    })

    it('returns false for unhandled tab id', () => {
      expect(matchesCategory({ type: 'mention' }, 'unknown-tab')).toBe(false)
    })
  })
})

