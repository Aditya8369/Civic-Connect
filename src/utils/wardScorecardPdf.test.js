import { describe, it, expect, vi } from 'vitest'
import { generateWardScorecardsPdf } from './wardScorecardPdf'

describe('generateWardScorecardsPdf', () => {
  const mockScorecards = [
    {
      wardId: 'WARD-01',
      wardName: 'Central Civic Core',
      zoneName: 'Central Zone',
      totalIssues: 25,
      resolvedIssues: 22,
      openIssues: 3,
      averageResolutionTimeHours: 18.2,
      slaComplianceRate: 92,
      citizenSatisfactionStars: 4.4,
      healthScore: 89,
      healthGrade: 'A',
      budgetPriority: 'Baseline - Efficiency Optimization',
      topCategory: 'Streetlight Issues',
    },
    {
      wardId: 'WARD-02',
      wardName: 'Heritage Ward',
      zoneName: 'East Zone',
      totalIssues: 40,
      resolvedIssues: 18,
      openIssues: 22,
      averageResolutionTimeHours: 64.5,
      slaComplianceRate: 58,
      citizenSatisfactionStars: 3.1,
      healthScore: 52,
      healthGrade: 'D',
      budgetPriority: 'Urgent - Critical Capital Infusion',
      topCategory: 'Potholes & Road Damage',
    },
  ]

  const mockCitywide = {
    totalComplaints: 65,
    resolvedComplaints: 40,
    averageResolutionTimeHours: 41.3,
    slaComplianceRate: 75,
    citizenSatisfactionStars: 3.7,
    citywideHealthScore: 70,
    topPerformingWard: mockScorecards[0],
    mostDistressedWard: mockScorecards[1],
  }

  it('generates a multi-section PDF document without errors', () => {
    const doc = generateWardScorecardsPdf({
      wardScorecards: mockScorecards,
      citywideSummary: mockCitywide,
    })

    expect(doc).toBeDefined()
    expect(typeof doc.save).toBe('function')
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
  })
})
