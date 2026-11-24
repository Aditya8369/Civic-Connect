import { describe, it, expect, vi } from 'vitest'
import {
  filterComplaintsForAnalytics,
  resolveComplaintWard,
  calculateWardHealthScorecards,
  exportWardScorecardsCsv,
} from './wardHealthScorecard'

describe('filterComplaintsForAnalytics', () => {
  const nowMs = 1700000000000 // fixed reference time
  const dayMs = 24 * 60 * 60 * 1000

  const mockComplaints = [
    {
      id: 'c1',
      category: 'Potholes & Road Damage',
      status: 'Resolved',
      createdAt: nowMs - 10 * dayMs, // 10 days ago
      resolvedAt: nowMs - 9.5 * dayMs, // resolved in 12h (fast)
    },
    {
      id: 'c2',
      category: 'Water Leakage',
      status: 'Resolved',
      createdAt: nowMs - 45 * dayMs, // 45 days ago
      resolvedAt: nowMs - 43 * dayMs, // resolved in 48h (standard)
    },
    {
      id: 'c3',
      category: 'Garbage & Sanitation',
      status: 'Pending',
      createdAt: nowMs - 120 * dayMs, // 120 days ago (old)
    },
  ]

  it('filters by timeWindow (30 days vs 90 days vs 365 days)', () => {
    const last30 = filterComplaintsForAnalytics(mockComplaints, { timeWindow: '30' }, nowMs)
    expect(last30).toHaveLength(1)
    expect(last30[0].id).toBe('c1')

    const last90 = filterComplaintsForAnalytics(mockComplaints, { timeWindow: '90' }, nowMs)
    expect(last90).toHaveLength(2)

    const all = filterComplaintsForAnalytics(mockComplaints, { timeWindow: 'all' }, nowMs)
    expect(all).toHaveLength(3)
  })

  it('filters by category', () => {
    const water = filterComplaintsForAnalytics(mockComplaints, { category: 'Water Leakage' }, nowMs)
    expect(water).toHaveLength(1)
    expect(water[0].id).toBe('c2')
  })

  it('filters by resolution speed (fast, standard, slow)', () => {
    const fast = filterComplaintsForAnalytics(mockComplaints, { resolutionSpeed: 'fast' }, nowMs)
    expect(fast).toHaveLength(1)
    expect(fast[0].id).toBe('c1')

    const standard = filterComplaintsForAnalytics(mockComplaints, { resolutionSpeed: 'standard' }, nowMs)
    expect(standard).toHaveLength(1)
    expect(standard[0].id).toBe('c2')
  })
})

describe('calculateWardHealthScorecards', () => {
  const nowMs = Date.now()
  const mockWards = [
    {
      wardId: 'WARD-01',
      wardName: 'Central Civic Core',
      zoneName: 'Zone A',
      councilorOffice: 'Office 1',
      helpline: '1800-11-2201',
      positions: [[28.61, 77.202], [28.61, 77.216]],
      center: [28.61, 77.209],
    },
    {
      wardId: 'WARD-02',
      wardName: 'Heritage Ward',
      zoneName: 'Zone B',
      councilorOffice: 'Office 2',
      helpline: '1800-11-2202',
      positions: [[28.616, 77.216], [28.622, 77.232]],
      center: [28.62, 77.22],
    },
  ]

  const complaints = [
    {
      id: 'comp-1',
      wardId: 'WARD-01',
      category: 'Streetlight Issues',
      status: 'Resolved',
      createdAt: nowMs - 12 * 3600 * 1000,
      resolvedAt: nowMs - 2 * 3600 * 1000, // 10h ART
      feedback: { rating: 5 },
    },
    {
      id: 'comp-2',
      wardId: 'WARD-01',
      category: 'Potholes & Road Damage',
      status: 'Resolved',
      createdAt: nowMs - 20 * 3600 * 1000,
      resolvedAt: nowMs - 6 * 3600 * 1000, // 14h ART
      feedback: { rating: 4 },
    },
    {
      id: 'comp-3',
      wardId: 'WARD-02',
      category: 'Water Leakage',
      status: 'Pending',
      createdAt: nowMs - 100 * 3600 * 1000, // breached SLA
    },
  ]

  it('computes ART, SLA Compliance Rate, CSI, and Health Score for each ward', () => {
    const { wardScorecards, citywideSummary } = calculateWardHealthScorecards(
      complaints,
      mockWards,
      {},
      nowMs
    )

    expect(wardScorecards).toHaveLength(2)

    const ward1 = wardScorecards.find((w) => w.wardId === 'WARD-01')
    expect(ward1).toBeDefined()
    expect(ward1.totalIssues).toBe(2)
    expect(ward1.resolvedIssues).toBe(2)
    expect(ward1.averageResolutionTimeHours).toBe(12) // (10 + 14) / 2
    expect(ward1.slaComplianceRate).toBe(100)
    expect(ward1.citizenSatisfactionStars).toBe(4.5)
    expect(ward1.healthScore).toBeGreaterThanOrEqual(85)
    expect(ward1.healthGrade).toBe('A')
    expect(ward1.budgetPriority).toContain('Baseline')

    const ward2 = wardScorecards.find((w) => w.wardId === 'WARD-02')
    expect(ward2).toBeDefined()
    expect(ward2.totalIssues).toBe(1)
    expect(ward2.resolvedIssues).toBe(0)
    expect(ward2.slaComplianceRate).toBe(0)
    expect(ward2.healthScore).toBeLessThan(60)

    // Citywide summary
    expect(citywideSummary.totalComplaints).toBe(3)
    expect(citywideSummary.resolvedComplaints).toBe(2)
    expect(citywideSummary.topPerformingWard.wardId).toBe('WARD-01')
    expect(citywideSummary.mostDistressedWard.wardId).toBe('WARD-02')
  })
})

describe('exportWardScorecardsCsv', () => {
  it('builds CSV rows and triggers download', () => {
    const origUrl = globalThis.URL
    globalThis.URL = {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    }
    const scorecards = [
      {
        wardId: 'WARD-01',
        wardName: 'Connaught',
        zoneName: 'Central',
        totalIssues: 10,
        resolvedIssues: 8,
        openIssues: 2,
        averageResolutionTimeHours: 14.5,
        slaComplianceRate: 90,
        citizenSatisfactionStars: 4.5,
        healthScore: 88,
        healthGrade: 'A',
        budgetPriority: 'Low',
        topCategory: 'Roads',
        councilorOffice: 'Main Office',
        helpline: '112',
      },
    ]

    expect(() => exportWardScorecardsCsv(scorecards)).not.toThrow()
    globalThis.URL = origUrl
  })
})
