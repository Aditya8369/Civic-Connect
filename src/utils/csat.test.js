import { describe, expect, it } from 'vitest'
import {
  analyzeCommentSentiment,
  calculateCsatMetrics,
  calculateDepartmentCsat,
  classifyRating,
  CSAT_DEPARTMENTS,
  getCsatStatus,
  hasValidFeedback,
  SENTIMENT_CATEGORIES,
} from './csat'

describe('CSAT & Sentiment Utilities', () => {
  describe('classifyRating', () => {
    it('classifies 4 and 5 stars as positive', () => {
      expect(classifyRating(5)).toBe(SENTIMENT_CATEGORIES.POSITIVE)
      expect(classifyRating(4)).toBe(SENTIMENT_CATEGORIES.POSITIVE)
    })

    it('classifies 3 stars as neutral', () => {
      expect(classifyRating(3)).toBe(SENTIMENT_CATEGORIES.NEUTRAL)
    })

    it('classifies 1 and 2 stars as negative', () => {
      expect(classifyRating(2)).toBe(SENTIMENT_CATEGORIES.NEGATIVE)
      expect(classifyRating(1)).toBe(SENTIMENT_CATEGORIES.NEGATIVE)
    })

    it('returns null for values outside 1-5 or invalid types', () => {
      expect(classifyRating(0)).toBeNull()
      expect(classifyRating(6)).toBeNull()
      expect(classifyRating(-1)).toBeNull()
      expect(classifyRating(null)).toBeNull()
      expect(classifyRating(undefined)).toBeNull()
      expect(classifyRating('5')).toBeNull()
      expect(classifyRating(Number.NaN)).toBeNull()
    })
  })

  describe('analyzeCommentSentiment', () => {
    it('detects positive sentiment from feedback text', () => {
      const result = analyzeCommentSentiment('Great work, repaired promptly and clean!')
      expect(result.sentiment).toBe(SENTIMENT_CATEGORIES.POSITIVE)
      expect(result.score).toBeGreaterThan(0)
      expect(result.matchedKeywords).toContain('great')
      expect(result.matchedKeywords).toContain('clean')
    })

    it('detects negative sentiment from complaint feedback text', () => {
      const result = analyzeCommentSentiment('Very slow and terrible delay, pothole still broken')
      expect(result.sentiment).toBe(SENTIMENT_CATEGORIES.NEGATIVE)
      expect(result.score).toBeLessThan(0)
      expect(result.matchedKeywords).toContain('slow')
      expect(result.matchedKeywords).toContain('terrible')
    })

    it('returns neutral for empty or keyword-free comments', () => {
      expect(analyzeCommentSentiment('').sentiment).toBe(SENTIMENT_CATEGORIES.NEUTRAL)
      expect(analyzeCommentSentiment(null).sentiment).toBe(SENTIMENT_CATEGORIES.NEUTRAL)
      expect(analyzeCommentSentiment('Standard inspection done.').sentiment).toBe(
        SENTIMENT_CATEGORIES.NEUTRAL
      )
    })
  })

  describe('hasValidFeedback', () => {
    it('returns true when complaint has feedback with numeric rating 1-5', () => {
      expect(hasValidFeedback({ feedback: { rating: 5 } })).toBe(true)
      expect(hasValidFeedback({ feedback: { rating: 1 } })).toBe(true)
      expect(hasValidFeedback({ feedback: { rating: 3 } })).toBe(true)
    })

    it('returns false for missing, out-of-range, or non-numeric ratings', () => {
      expect(hasValidFeedback(null)).toBe(false)
      expect(hasValidFeedback({})).toBe(false)
      expect(hasValidFeedback({ feedback: null })).toBe(false)
      expect(hasValidFeedback({ feedback: { rating: 0 } })).toBe(false)
      expect(hasValidFeedback({ feedback: { rating: 6 } })).toBe(false)
      expect(hasValidFeedback({ feedback: { rating: '5' } })).toBe(false)
    })
  })

  describe('calculateCsatMetrics', () => {
    it('returns empty metrics when passed null, empty array, or complaints without feedback', () => {
      const empty = calculateCsatMetrics([])
      expect(empty.totalRated).toBe(0)
      expect(empty.averageRating).toBe(0)
      expect(empty.csatScore).toBe(0)
      expect(empty.netScore).toBe(0)
      expect(empty.positiveRatio).toBe(0)
      expect(empty.recentFeedback).toEqual([])

      const noFeedback = calculateCsatMetrics([
        { id: '1', title: 'Test 1' },
        { id: '2', title: 'Test 2', feedback: null },
      ])
      expect(noFeedback.totalRated).toBe(0)
    })

    it('calculates 100% CSAT when all ratings are 4 or 5 stars', () => {
      const complaints = [
        { id: '1', department: 'Roads', feedback: { rating: 5, comment: 'Excellent' } },
        { id: '2', department: 'Roads', feedback: { rating: 4, comment: 'Good job' } },
      ]

      const metrics = calculateCsatMetrics(complaints)
      expect(metrics.totalRated).toBe(2)
      expect(metrics.averageRating).toBe(4.5)
      expect(metrics.csatScore).toBe(100)
      expect(metrics.positiveCount).toBe(2)
      expect(metrics.positiveRatio).toBe(100)
      expect(metrics.neutralCount).toBe(0)
      expect(metrics.negativeCount).toBe(0)
      expect(metrics.netScore).toBe(100)
    })

    it('calculates 0% CSAT when all ratings are 1 or 2 stars', () => {
      const complaints = [
        { id: '1', department: 'Water', feedback: { rating: 1, comment: 'Terrible' } },
        { id: '2', department: 'Water', feedback: { rating: 2, comment: 'Slow' } },
      ]

      const metrics = calculateCsatMetrics(complaints)
      expect(metrics.totalRated).toBe(2)
      expect(metrics.averageRating).toBe(1.5)
      expect(metrics.csatScore).toBe(0)
      expect(metrics.negativeCount).toBe(2)
      expect(metrics.negativeRatio).toBe(100)
      expect(metrics.netScore).toBe(-100)
    })

    it('calculates mixed ratings and sentiment ratios accurately', () => {
      // 5 items: ratings 5, 4 (2 positive = 40%), 3 (1 neutral = 20%), 2, 1 (2 negative = 40%)
      const complaints = [
        { id: 'c1', department: 'Sanitation', feedback: { rating: 5 } },
        { id: 'c2', department: 'Sanitation', feedback: { rating: 4 } },
        { id: 'c3', department: 'Sanitation', feedback: { rating: 3 } },
        { id: 'c4', department: 'Sanitation', feedback: { rating: 2 } },
        { id: 'c5', department: 'Sanitation', feedback: { rating: 1 } },
      ]

      const metrics = calculateCsatMetrics(complaints)
      expect(metrics.totalRated).toBe(5)
      expect(metrics.averageRating).toBe(3.0)
      expect(metrics.csatScore).toBe(40)
      expect(metrics.positiveRatio).toBe(40)
      expect(metrics.neutralRatio).toBe(20)
      expect(metrics.negativeRatio).toBe(40)
      expect(metrics.netScore).toBe(0) // 40 - 40
    })

    it('sorts recentFeedback descending by submission time', () => {
      const complaints = [
        {
          id: 'older',
          department: 'Electricity',
          feedback: { rating: 4, submittedAt: new Date('2026-01-01T10:00:00Z') },
        },
        {
          id: 'newer',
          department: 'Electricity',
          feedback: { rating: 5, submittedAt: new Date('2026-02-01T10:00:00Z') },
        },
      ]

      const metrics = calculateCsatMetrics(complaints)
      expect(metrics.recentFeedback[0].id).toBe('newer')
      expect(metrics.recentFeedback[1].id).toBe('older')
    })
  })

  describe('calculateDepartmentCsat', () => {
    it('initializes all standard departments by default', () => {
      const results = calculateDepartmentCsat([])
      const deptNames = results.map((d) => d.department)

      for (const dept of CSAT_DEPARTMENTS) {
        expect(deptNames).toContain(dept)
      }
      expect(results.every((d) => d.totalRated === 0)).toBe(true)
    })

    it('groups feedback by department and computes isolated metrics', () => {
      const complaints = [
        { id: '1', department: 'Roads', feedback: { rating: 5 } },
        { id: '2', department: 'Roads', feedback: { rating: 5 } },
        { id: '3', department: 'Water', feedback: { rating: 2 } },
      ]

      const results = calculateDepartmentCsat(complaints)
      const roads = results.find((d) => d.department === 'Roads')
      const water = results.find((d) => d.department === 'Water')
      const sanitation = results.find((d) => d.department === 'Sanitation')

      expect(roads.totalRated).toBe(2)
      expect(roads.csatScore).toBe(100)
      expect(roads.averageRating).toBe(5.0)

      expect(water.totalRated).toBe(1)
      expect(water.csatScore).toBe(0)
      expect(water.averageRating).toBe(2.0)

      expect(sanitation.totalRated).toBe(0)
      expect(sanitation.csatScore).toBe(0)
    })

    it('sorts departments with most feedback first', () => {
      const complaints = [
        { id: '1', department: 'Water', feedback: { rating: 4 } },
        { id: '2', department: 'Roads', feedback: { rating: 5 } },
        { id: '3', department: 'Roads', feedback: { rating: 4 } },
      ]

      const results = calculateDepartmentCsat(complaints)
      expect(results[0].department).toBe('Roads')
      expect(results[1].department).toBe('Water')
    })
  })

  describe('getCsatStatus', () => {
    it('returns "No Feedback" when totalRated is 0', () => {
      const status = getCsatStatus(0, 0)
      expect(status.variant).toBe('secondary')
      expect(status.label).toBe('No Feedback')
    })

    it('returns "Excellent" for scores >= 80%', () => {
      expect(getCsatStatus(85, 10).variant).toBe('success')
      expect(getCsatStatus(80, 5).label).toBe('Excellent')
    })

    it('returns "Good" for scores 60% - 79%', () => {
      expect(getCsatStatus(75, 10).variant).toBe('warning')
      expect(getCsatStatus(60, 5).label).toBe('Good')
    })

    it('returns "Needs Attention" for scores below 60%', () => {
      expect(getCsatStatus(59, 10).variant).toBe('destructive')
      expect(getCsatStatus(30, 8).label).toBe('Needs Attention')
    })
  })
})

