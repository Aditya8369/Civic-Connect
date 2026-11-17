/**
 * Citizen Satisfaction (CSAT) and Sentiment Analysis Utilities
 *
 * Computes Net Citizen Satisfaction (CSAT) scores, average star ratings,
 * and positive/neutral/negative sentiment distribution ratios per department
 * and across the entire municipality.
 */

export const CSAT_DEPARTMENTS = [
  'Roads',
  'Sanitation',
  'Electricity',
  'Water',
  'Public Safety',
]

export const SENTIMENT_CATEGORIES = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
}

const POSITIVE_KEYWORDS = [
  'good',
  'great',
  'excellent',
  'fast',
  'quick',
  'prompt',
  'resolved',
  'fixed',
  'clean',
  'thanks',
  'thank you',
  'helpful',
  'appreciate',
  'satisfied',
  'efficient',
  'polite',
  'courteous',
  'smooth',
  'perfect',
  'timely',
]

const NEGATIVE_KEYWORDS = [
  'bad',
  'poor',
  'terrible',
  'slow',
  'delay',
  'delayed',
  'unresolved',
  'unhelpful',
  'rude',
  'worst',
  'broken',
  'dirty',
  'waste',
  'incomplete',
  'unsatisfied',
  'dissatisfied',
  'disappointed',
  'fail',
  'failed',
  'horrible',
]

/**
 * Classifies a 1-5 star numerical rating into a sentiment category:
 * - 4-5 stars: positive
 * - 3 stars: neutral
 * - 1-2 stars: negative
 *
 * @param {number} rating
 * @returns {'positive' | 'neutral' | 'negative' | null}
 */
export function classifyRating(rating) {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return null
  }
  if (rating >= 4 && rating <= 5) return SENTIMENT_CATEGORIES.POSITIVE
  if (rating === 3) return SENTIMENT_CATEGORIES.NEUTRAL
  if (rating >= 1 && rating <= 2) return SENTIMENT_CATEGORIES.NEGATIVE
  return null
}

/**
 * Analyzes citizen text comments for sentiment polarity based on civic feedback keywords.
 *
 * @param {string} comment
 * @returns {{ sentiment: 'positive' | 'neutral' | 'negative', score: number, matchedKeywords: string[] }}
 */
export function analyzeCommentSentiment(comment) {
  if (typeof comment !== 'string' || !comment.trim()) {
    return { sentiment: SENTIMENT_CATEGORIES.NEUTRAL, score: 0, matchedKeywords: [] }
  }

  const normalized = comment.toLowerCase()
  const matchedPositive = POSITIVE_KEYWORDS.filter((word) => normalized.includes(word))
  const matchedNegative = NEGATIVE_KEYWORDS.filter((word) => normalized.includes(word))

  const score = matchedPositive.length - matchedNegative.length
  const matchedKeywords = [...matchedPositive, ...matchedNegative]

  let sentiment = SENTIMENT_CATEGORIES.NEUTRAL
  if (score > 0) sentiment = SENTIMENT_CATEGORIES.POSITIVE
  if (score < 0) sentiment = SENTIMENT_CATEGORIES.NEGATIVE

  return { sentiment, score, matchedKeywords }
}

/**
 * Validates whether a complaint has a valid feedback object with a 1-5 rating.
 *
 * @param {object} complaint
 * @returns {boolean}
 */
export function hasValidFeedback(complaint) {
  const rating = complaint?.feedback?.rating
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5
}

/**
 * Normalizes feedback submitted timestamp into epoch milliseconds for consistent sorting.
 *
 * @param {any} ts
 * @returns {number}
 */
function extractEpochMs(ts) {
  if (!ts) return 0
  if (typeof ts.toMillis === 'function') return ts.toMillis()
  if (typeof ts.toDate === 'function') return ts.toDate().getTime()
  if (ts instanceof Date) return ts.getTime()
  if (typeof ts === 'number') return ts
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Calculates overall CSAT metrics from a list of complaints:
 * - totalRated: Total tickets with feedback
 * - averageRating: 1.0 - 5.0 (rounded to 1 decimal place)
 * - csatScore: % of positive ratings (4-5 stars) [0 - 100]
 * - positiveCount, neutralCount, negativeCount
 * - positiveRatio, neutralRatio, negativeRatio (0 - 100 percentages)
 * - netScore: positiveRatio - negativeRatio (-100 to +100)
 * - recentFeedback: Array of latest feedback entries sorted newest first
 *
 * @param {Array<object>} complaints
 * @returns {object}
 */
export function calculateCsatMetrics(complaints = []) {
  if (!Array.isArray(complaints)) {
    return createEmptyCsatMetrics()
  }

  const ratedComplaints = complaints.filter(hasValidFeedback)
  const totalRated = ratedComplaints.length

  if (totalRated === 0) {
    return createEmptyCsatMetrics()
  }

  let totalStars = 0
  let positiveCount = 0
  let neutralCount = 0
  let negativeCount = 0

  const feedbackList = []

  for (const item of ratedComplaints) {
    const rating = Math.round(item.feedback.rating)
    totalStars += rating

    const sentiment = classifyRating(rating)
    if (sentiment === SENTIMENT_CATEGORIES.POSITIVE) positiveCount++
    else if (sentiment === SENTIMENT_CATEGORIES.NEUTRAL) neutralCount++
    else if (sentiment === SENTIMENT_CATEGORIES.NEGATIVE) negativeCount++

    const comment = typeof item.feedback.comment === 'string' ? item.feedback.comment.trim() : ''
    const commentAnalysis = analyzeCommentSentiment(comment)

    feedbackList.push({
      id: item.id || item.complaintId || '',
      complaintId: item.complaintId || item.id || '',
      title: item.title || '',
      department: typeof item.department === 'string' ? item.department.trim() : 'Unassigned',
      rating,
      comment,
      tags: Array.isArray(item.feedback.tags) ? item.feedback.tags : [],
      submittedAt: item.feedback.submittedAt || null,
      submittedMs: extractEpochMs(item.feedback.submittedAt),
      ratingSentiment: sentiment,
      commentSentiment: commentAnalysis.sentiment,
    })
  }

  feedbackList.sort((a, b) => b.submittedMs - a.submittedMs)

  const averageRating = Number((totalStars / totalRated).toFixed(1))
  const positiveRatio = Math.round((positiveCount / totalRated) * 100)
  const neutralRatio = Math.round((neutralCount / totalRated) * 100)
  const negativeRatio = Math.round((negativeCount / totalRated) * 100)

  // Net Citizen Satisfaction (CSAT) is defined as % of satisfied citizens (4-5 stars)
  const csatScore = positiveRatio
  // Net Sentiment Score (% Positive - % Negative, analogous to NPS)
  const netScore = positiveRatio - negativeRatio

  return {
    totalRated,
    averageRating,
    csatScore,
    netScore,
    positiveCount,
    neutralCount,
    negativeCount,
    positiveRatio,
    neutralRatio,
    negativeRatio,
    recentFeedback: feedbackList.slice(0, 20),
  }
}

/**
 * Aggregates CSAT and sentiment metrics broken down per department.
 *
 * @param {Array<object>} complaints
 * @param {{ includeAllStandard?: boolean }} [options]
 * @returns {Array<object>} List of department CSAT statistics
 */
export function calculateDepartmentCsat(complaints = [], options = {}) {
  const { includeAllStandard = true } = options
  const departmentMap = new Map()

  if (includeAllStandard) {
    for (const dept of CSAT_DEPARTMENTS) {
      departmentMap.set(dept, [])
    }
  }

  if (Array.isArray(complaints)) {
    for (const item of complaints) {
      if (!hasValidFeedback(item)) continue

      const rawDept = typeof item.department === 'string' ? item.department.trim() : ''
      const dept = rawDept || 'Other'

      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, [])
      }
      departmentMap.get(dept).push(item)
    }
  }

  const results = []
  for (const [department, deptComplaints] of departmentMap.entries()) {
    const metrics = calculateCsatMetrics(deptComplaints)
    results.push({
      department,
      ...metrics,
    })
  }

  // Sort by highest total rated tickets first, then CSAT score, then alphabetical
  return results.sort((a, b) => {
    if (b.totalRated !== a.totalRated) return b.totalRated - a.totalRated
    if (b.csatScore !== a.csatScore) return b.csatScore - a.csatScore
    return a.department.localeCompare(b.department)
  })
}

/**
 * Returns a human-friendly status assessment and visual tone for a given CSAT score.
 *
 * @param {number} csatScore
 * @param {number} totalRated
 * @returns {{ label: string, variant: 'success' | 'warning' | 'destructive' | 'secondary', color: string }}
 */
export function getCsatStatus(csatScore, totalRated = 0) {
  if (totalRated === 0) {
    return {
      label: 'No Feedback',
      variant: 'secondary',
      color: 'gray',
    }
  }
  if (csatScore >= 80) {
    return {
      label: 'Excellent',
      variant: 'success',
      color: 'emerald',
    }
  }
  if (csatScore >= 60) {
    return {
      label: 'Good',
      variant: 'warning',
      color: 'amber',
    }
  }
  return {
    label: 'Needs Attention',
    variant: 'destructive',
    color: 'rose',
  }
}

/**
 * Returns an empty CSAT metrics object structure.
 *
 * @returns {object}
 */
function createEmptyCsatMetrics() {
  return {
    totalRated: 0,
    averageRating: 0,
    csatScore: 0,
    netScore: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    positiveRatio: 0,
    neutralRatio: 0,
    negativeRatio: 0,
    recentFeedback: [],
  }
}

