import { describe, it, expect } from 'vitest'
import {
  matchesReport,
  extractAvailableWards,
  normalizePriority,
  SPOTLIGHT_CATEGORIES,
  SPOTLIGHT_PRIORITIES,
  SPOTLIGHT_STATUSES,
  DEFAULT_MUNICIPAL_WARDS,
} from './spotlightSearch'

const sampleReport = {
  id: 'rep-001',
  complaintId: 'CMP-2026-0042',
  title: 'Dangerous Pothole on MG Road',
  description: 'Deep pothole near the pedestrian crossing causing traffic bottlenecks and accidents.',
  category: 'Potholes & Road Damage',
  priority: 'High',
  status: 'Pending',
  ward: 'Ward 4',
  address: 'MG Road, Ward 4, Bengaluru',
  location: 'Opposite City Center',
  department: 'Roads',
}

describe('Spotlight Search Utilities (spotlightSearch.js)', () => {
  describe('matchesReport - Text Search', () => {
    it('searches by title case-insensitively', () => {
      expect(matchesReport(sampleReport, 'dangerous pothole')).toBe(true)
      expect(matchesReport(sampleReport, 'POTHOLE')).toBe(true)
      expect(matchesReport(sampleReport, 'highway')).toBe(false)
    })

    it('searches by description case-insensitively', () => {
      expect(matchesReport(sampleReport, 'pedestrian crossing')).toBe(true)
      expect(matchesReport(sampleReport, 'bottlenecks')).toBe(true)
      expect(matchesReport(sampleReport, 'bridge collapse')).toBe(false)
    })

    it('searches by category', () => {
      expect(matchesReport(sampleReport, 'road damage')).toBe(true)
      expect(matchesReport(sampleReport, 'potholes')).toBe(true)
      expect(matchesReport(sampleReport, 'Water Leakage')).toBe(false)
    })

    it('searches by ward, address, and location', () => {
      expect(matchesReport(sampleReport, 'Ward 4')).toBe(true)
      expect(matchesReport(sampleReport, 'MG Road')).toBe(true)
      expect(matchesReport(sampleReport, 'City Center')).toBe(true)
      expect(matchesReport(sampleReport, 'Ward 99')).toBe(false)
    })

    it('searches by status and priority', () => {
      expect(matchesReport(sampleReport, 'pending')).toBe(true)
      expect(matchesReport(sampleReport, 'high')).toBe(true)
      expect(matchesReport(sampleReport, 'resolved')).toBe(false)
      expect(matchesReport(sampleReport, 'low')).toBe(false)
    })

    it('searches by report ID and complaintId', () => {
      expect(matchesReport(sampleReport, 'CMP-2026-0042')).toBe(true)
      expect(matchesReport(sampleReport, '0042')).toBe(true)
      expect(matchesReport(sampleReport, 'rep-001')).toBe(true)
      expect(matchesReport(sampleReport, 'CMP-9999')).toBe(false)
    })

    it('trims leading and trailing whitespace from query', () => {
      expect(matchesReport(sampleReport, '   dangerous   ')).toBe(true)
      expect(matchesReport(sampleReport, '   CMP-2026-0042   ')).toBe(true)
    })

    it('handles empty or whitespace-only search query', () => {
      expect(matchesReport(sampleReport, '')).toBe(true)
      expect(matchesReport(sampleReport, '    ')).toBe(true)
      expect(matchesReport(sampleReport, null)).toBe(true)
      expect(matchesReport(sampleReport, undefined)).toBe(true)
    })

    it('handles null or undefined reports safely', () => {
      expect(matchesReport(null, 'road')).toBe(false)
      expect(matchesReport(undefined, 'road')).toBe(false)
    })
  })

  describe('matchesReport - Quick Filters', () => {
    it('filters by category (exact and partial match)', () => {
      expect(matchesReport(sampleReport, '', { category: 'Potholes & Road Damage' })).toBe(true)
      expect(matchesReport(sampleReport, '', { category: 'Road Damage' })).toBe(true)
      expect(matchesReport(sampleReport, '', { category: 'Streetlight Issues' })).toBe(false)
      expect(matchesReport(sampleReport, '', { category: 'all' })).toBe(true)
    })

    it('filters by priority', () => {
      expect(matchesReport(sampleReport, '', { priority: 'High' })).toBe(true)
      expect(matchesReport(sampleReport, '', { priority: 'high' })).toBe(true)
      expect(matchesReport(sampleReport, '', { priority: 'Critical' })).toBe(false)
      expect(matchesReport(sampleReport, '', { priority: 'Low' })).toBe(false)
      expect(matchesReport(sampleReport, '', { priority: 'all' })).toBe(true)
    })

    it('filters by ward (from ward, address, or location)', () => {
      expect(matchesReport(sampleReport, '', { ward: 'Ward 4' })).toBe(true)
      expect(matchesReport(sampleReport, '', { ward: 'ward 4' })).toBe(true)
      expect(matchesReport(sampleReport, '', { ward: 'Ward 7' })).toBe(false)
      expect(matchesReport(sampleReport, '', { ward: 'all' })).toBe(true)
    })

    it('filters by status', () => {
      expect(matchesReport(sampleReport, '', { status: 'Pending' })).toBe(true)
      expect(matchesReport(sampleReport, '', { status: 'pending' })).toBe(true)
      expect(matchesReport(sampleReport, '', { status: 'Resolved' })).toBe(false)
      expect(matchesReport(sampleReport, '', { status: 'all' })).toBe(true)
    })

    it('combines multiple filters together (Category + Priority + Ward + Status)', () => {
      // All match
      expect(
        matchesReport(sampleReport, '', {
          category: 'Potholes & Road Damage',
          priority: 'High',
          ward: 'Ward 4',
          status: 'Pending',
        })
      ).toBe(true)

      // One mismatch fails overall match
      expect(
        matchesReport(sampleReport, '', {
          category: 'Potholes & Road Damage',
          priority: 'Low', // mismatch
          ward: 'Ward 4',
          status: 'Pending',
        })
      ).toBe(false)

      expect(
        matchesReport(sampleReport, '', {
          category: 'Potholes & Road Damage',
          priority: 'High',
          ward: 'Ward 10', // mismatch
          status: 'Pending',
        })
      ).toBe(false)
    })

    it('combines text search with all 4 selected filters', () => {
      // Matches both text "road" and all 4 filters
      expect(
        matchesReport(sampleReport, 'road', {
          category: 'Road',
          priority: 'High',
          ward: 'Ward 4',
          status: 'Pending',
        })
      ).toBe(true)

      // Filter matches but text does not
      expect(
        matchesReport(sampleReport, 'streetlight', {
          category: 'Road',
          priority: 'High',
          ward: 'Ward 4',
          status: 'Pending',
        })
      ).toBe(false)
    })
  })

  describe('extractAvailableWards', () => {
    it('extracts unique wards from reports data', () => {
      const reports = [
        { ward: 'Ward 12', address: '123 Cross St' },
        { ward: 'Ward 3', address: 'Park Ave' },
        { address: 'Main Blvd, Ward 12' },
        { address: 'Near Ward 5 Market' },
      ]

      const wards = extractAvailableWards(reports)
      expect(wards).toContain('Ward 3')
      expect(wards).toContain('Ward 5')
      expect(wards).toContain('Ward 12')
      // No duplicates
      expect(wards.filter((w) => w === 'Ward 12')).toHaveLength(1)
    })

    it('falls back to default municipal wards when no reports or wards exist', () => {
      expect(extractAvailableWards([])).toEqual(DEFAULT_MUNICIPAL_WARDS)
      expect(extractAvailableWards([{ title: 'No ward info' }])).toEqual(DEFAULT_MUNICIPAL_WARDS)
    })
  })

  describe('normalizePriority & constants', () => {
    it('normalizes priorities correctly', () => {
      expect(normalizePriority('critical')).toBe('Critical')
      expect(normalizePriority('HIGH')).toBe('High')
      expect(normalizePriority('medium')).toBe('Medium')
      expect(normalizePriority('Low')).toBe('Low')
      expect(normalizePriority('')).toBe('')
      expect(normalizePriority(null)).toBe('')
    })

    it('exports all expected application categories, priorities and statuses', () => {
      expect(SPOTLIGHT_CATEGORIES).toContain('Potholes & Road Damage')
      expect(SPOTLIGHT_CATEGORIES).toContain('Streetlight Issues')
      expect(SPOTLIGHT_CATEGORIES).toContain('Water Leakage')
      expect(SPOTLIGHT_PRIORITIES).toEqual(['Critical', 'High', 'Medium', 'Low'])
      expect(SPOTLIGHT_STATUSES).toEqual(['Pending', 'In Progress', 'Resolved', 'Rejected', 'Reopened'])
    })
  })
})

