import { parseCoordinates, findWardForCoordinates } from './geo'
import { getNormalizedWards } from './wardBoundaries'
import { parseTimestamp, isSlaBreached, getSlaDurationHours } from './sla'
import { toCsv, downloadCsv, formatDateStamp } from './csv'

/**
 * Filter complaints by time window, category, and resolution speed.
 *
 * @param {Array<Object>} complaints
 * @param {Object} [filters]
 * @param {number} [nowMs=Date.now()]
 * @returns {Array<Object>}
 */
export function filterComplaintsForAnalytics(
  complaints,
  { timeWindow = 'all', category = 'all', resolutionSpeed = 'all' } = {},
  nowMs = Date.now()
) {
  if (!Array.isArray(complaints)) return []

  const timeWindowDays =
    timeWindow === '30'
      ? 30
      : timeWindow === '90'
        ? 90
        : timeWindow === '365'
          ? 365
          : null

  const cutoffMs = timeWindowDays ? nowMs - timeWindowDays * 24 * 60 * 60 * 1000 : 0

  return complaints.filter((c) => {
    if (!c) return false

    // 1. Time window filter
    if (cutoffMs > 0) {
      const createdMs = parseTimestamp(c.createdAt) || 0
      if (createdMs > 0 && createdMs < cutoffMs) {
        return false
      }
    }

    // 2. Category filter
    if (category && category !== 'all' && category !== 'All') {
      if ((c.category || '').toLowerCase() !== category.toLowerCase()) {
        return false
      }
    }

    // 3. Resolution speed filter
    if (resolutionSpeed && resolutionSpeed !== 'all') {
      const status = (c.status || '').toLowerCase()
      const isResolved = status === 'resolved'
      const createdMs = parseTimestamp(c.createdAt) || 0
      const resolvedMs = parseTimestamp(c.resolvedAt) || nowMs
      const durationHours =
        createdMs > 0 && resolvedMs >= createdMs
          ? (resolvedMs - createdMs) / (1000 * 60 * 60)
          : 0

      if (resolutionSpeed === 'fast') {
        // Fast: resolved within <= 24 hours
        if (!isResolved || durationHours > 24) return false
      } else if (resolutionSpeed === 'standard') {
        // Standard: resolved within 24 to 72 hours
        if (!isResolved || durationHours <= 24 || durationHours > 72) return false
      } else if (resolutionSpeed === 'slow') {
        // Slow: resolved in > 72 hours OR currently open and breached SLA
        const breached = isSlaBreached(c, nowMs)
        if (isResolved) {
          if (durationHours <= 72) return false
        } else {
          if (!breached) return false
        }
      }
    }

    return true
  })
}

/**
 * Resolves a complaint to a specific ward ID.
 */
export function resolveComplaintWard(complaint, wards = getNormalizedWards()) {
  if (!complaint) return null

  // Direct wardId property
  if (complaint.wardId) {
    const direct = wards.find(
      (w) => w.wardId.toUpperCase() === String(complaint.wardId).toUpperCase()
    )
    if (direct) return direct
  }

  // Coordinate check via pointInPolygon
  const coords = parseCoordinates(complaint)
  if (coords) {
    const matched = findWardForCoordinates(coords)
    if (matched) {
      const found = wards.find((w) => w.wardId.toUpperCase() === matched.wardId.toUpperCase())
      if (found) return found
    }
  }

  // Fallback: search ward name in address or wardId
  const addr = (complaint.address || '').toLowerCase()
  for (const ward of wards) {
    if (
      addr.includes(ward.wardId.toLowerCase()) ||
      addr.includes(ward.wardName.toLowerCase())
    ) {
      return ward
    }
  }

  return wards[0] || null
}

/**
 * Computes Ward Infrastructure Health Scorecard metrics across municipal wards.
 *
 * @param {Array<Object>} complaints
 * @param {Array<Object>} [wards]
 * @param {Object} [filters]
 * @param {number} [nowMs=Date.now()]
 * @returns {Object} { wardScorecards, citywideSummary, filteredComplaints }
 */
export function calculateWardHealthScorecards(
  complaints = [],
  wards = getNormalizedWards(),
  filters = {},
  nowMs = Date.now()
) {
  const filtered = filterComplaintsForAnalytics(complaints, filters, nowMs)

  // Group complaints by ward
  const wardMap = new Map()
  for (const ward of wards) {
    wardMap.set(ward.wardId, {
      ward,
      complaints: [],
    })
  }

  for (const complaint of filtered) {
    const resolvedWard = resolveComplaintWard(complaint, wards)
    const wardId = resolvedWard?.wardId || wards[0]?.wardId
    if (wardId && wardMap.has(wardId)) {
      wardMap.get(wardId).complaints.push(complaint)
    }
  }

  let citywideResolvedCount = 0
  let citywideTotalResolutionHours = 0
  let citywideCompliantCount = 0
  let citywideTotalRatingsSum = 0
  let citywideTotalRatedCount = 0

  const wardScorecards = []

  for (const [wardId, { ward, complaints: wardComplaints }] of wardMap.entries()) {
    const totalIssues = wardComplaints.length
    let resolvedIssues = 0
    let totalResolutionHours = 0
    let compliantIssues = 0
    let totalRatings = 0
    let ratingsCount = 0

    const categoryCounts = {}

    for (const c of wardComplaints) {
      const status = (c.status || '').toLowerCase()
      const isResolved = status === 'resolved'
      const createdMs = parseTimestamp(c.createdAt) || 0
      const resolvedMs = parseTimestamp(c.resolvedAt) || nowMs

      if (isResolved) {
        resolvedIssues++
        if (createdMs > 0 && resolvedMs >= createdMs) {
          const durationHours = (resolvedMs - createdMs) / (1000 * 60 * 60)
          totalResolutionHours += durationHours
          citywideTotalResolutionHours += durationHours
          citywideResolvedCount++
        }
      }

      // SLA compliance check
      const breached = isSlaBreached(c, nowMs)
      if (!breached) {
        compliantIssues++
        citywideCompliantCount++
      }

      // Citizen satisfaction check
      const rating = Number(c.feedback?.rating || c.rating)
      if (rating >= 1 && rating <= 5) {
        totalRatings += rating
        ratingsCount++
        citywideTotalRatingsSum += rating
        citywideTotalRatedCount++
      }

      // Category breakdown
      const cat = c.category || 'Other'
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    }

    const openIssues = totalIssues - resolvedIssues

    // 1. Average Resolution Time (ART) in hours
    const averageResolutionTimeHours =
      resolvedIssues > 0
        ? Math.round((totalResolutionHours / resolvedIssues) * 10) / 10
        : 0

    // 2. SLA Compliance Rate (%)
    const slaComplianceRate =
      totalIssues > 0
        ? Math.round((compliantIssues / totalIssues) * 1000) / 10
        : 100

    // 3. Citizen Satisfaction Index (CSI 1-5 scale and %)
    const citizenSatisfactionStars =
      ratingsCount > 0
        ? Math.round((totalRatings / ratingsCount) * 10) / 10
        : 4.0
    const citizenSatisfactionIndex = Math.round((citizenSatisfactionStars / 5) * 1000) / 10

    // 4. Resolution Rate (%)
    const resolutionRate =
      totalIssues > 0 ? (resolvedIssues / totalIssues) * 100 : 100

    // 5. Composite Infrastructure Health Score (0 - 100)
    // Formula: 40% SLA Compliance + 30% Citizen Satisfaction + 30% Resolution Performance
    let rawHealthScore =
      0.4 * slaComplianceRate +
      0.3 * citizenSatisfactionIndex +
      0.3 * resolutionRate

    // Apply penalty for high open backlogs or excessive ART (>72h)
    if (averageResolutionTimeHours > 72) {
      rawHealthScore -= 5
    }
    if (openIssues > 15) {
      rawHealthScore -= 5
    }

    const healthScore = Math.max(10, Math.min(100, Math.round(rawHealthScore)))

    // 6. Health Grade
    let healthGrade = 'B'
    let healthColor = '#3b82f6'
    let budgetPriority = 'Moderate - Preventive Maintenance'
    let budgetRecommendation = 'Standard maintenance & operational allocation'

    if (healthScore >= 85) {
      healthGrade = 'A'
      healthColor = '#10b981' // Green
      budgetPriority = 'Baseline - Efficiency Optimization'
      budgetRecommendation = 'Sustain top-tier performance; allocate surplus to civic smart sensors.'
    } else if (healthScore >= 70) {
      healthGrade = 'B'
      healthColor = '#3b82f6' // Blue
      budgetPriority = 'Moderate - Preventive Maintenance'
      budgetRecommendation = 'Maintain infrastructure cadence and address localized repair spikes.'
    } else if (healthScore >= 55) {
      healthGrade = 'C'
      healthColor = '#f59e0b' // Amber
      budgetPriority = 'High - Infrastructure & SLA Modernization'
      budgetRecommendation = 'Targeted 25% budget boost for backlog reduction and crew re-allocation.'
    } else {
      healthGrade = 'D'
      healthColor = '#ef4444' // Red
      budgetPriority = 'Urgent - Critical Capital Infusion'
      budgetRecommendation = 'Emergency municipal budget allocation required for urgent infrastructure remediation.'
    }

    // Top backlog category
    const topCategory =
      Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Roads & Sanitation'

    wardScorecards.push({
      wardId: ward.wardId,
      wardName: ward.wardName,
      zoneName: ward.zoneName,
      councilorOffice: ward.councilorOffice,
      helpline: ward.helpline,
      positions: ward.positions,
      center: ward.center,
      totalIssues,
      resolvedIssues,
      openIssues,
      averageResolutionTimeHours,
      slaComplianceRate,
      citizenSatisfactionStars,
      citizenSatisfactionIndex,
      resolutionRate: Math.round(resolutionRate * 10) / 10,
      healthScore,
      healthGrade,
      healthColor,
      budgetPriority,
      budgetRecommendation,
      topCategory,
    })
  }

  // Sort scorecards: lowest health score first (to highlight distressed wards for budget planning)
  wardScorecards.sort((a, b) => a.healthScore - b.healthScore)

  // Executive Citywide Summary
  const citywideTotalIssues = filtered.length
  const citywideResolved = filtered.filter((c) => (c.status || '').toLowerCase() === 'resolved').length
  const citywideArtHours =
    citywideResolvedCount > 0
      ? Math.round((citywideTotalResolutionHours / citywideResolvedCount) * 10) / 10
      : 0
  const citywideSlaRate =
    citywideTotalIssues > 0
      ? Math.round((citywideCompliantCount / citywideTotalIssues) * 1000) / 10
      : 100
  const citywideCsiStars =
    citywideTotalRatedCount > 0
      ? Math.round((citywideTotalRatingsSum / citywideTotalRatedCount) * 10) / 10
      : 4.1
  const citywideHealthScore =
    wardScorecards.length > 0
      ? Math.round(
          wardScorecards.reduce((sum, w) => sum + w.healthScore, 0) / wardScorecards.length
        )
      : 80

  const topPerformingWard = [...wardScorecards].sort((a, b) => b.healthScore - a.healthScore)[0]
  const mostDistressedWard = wardScorecards[0]

  const citywideSummary = {
    totalComplaints: citywideTotalIssues,
    resolvedComplaints: citywideResolved,
    openComplaints: citywideTotalIssues - citywideResolved,
    averageResolutionTimeHours: citywideArtHours,
    slaComplianceRate: citywideSlaRate,
    citizenSatisfactionStars: citywideCsiStars,
    citywideHealthScore,
    topPerformingWard,
    mostDistressedWard,
  }

  return {
    wardScorecards,
    citywideSummary,
    filteredComplaints: filtered,
  }
}

/**
 * Exports Ward Health Scorecards to a formatted CSV spreadsheet.
 *
 * @param {Array<Object>} wardScorecards
 * @param {Object} [filters]
 * @param {Date} [now=new Date()]
 */
export function exportWardScorecardsCsv(wardScorecards, filters = {}, now = new Date()) {
  const headers = [
    'Ward ID',
    'Ward Name',
    'Municipal Zone',
    'Total Issues',
    'Resolved Issues',
    'Open Issues',
    'Average Resolution Time (Hours)',
    'SLA Compliance Rate (%)',
    'Citizen Satisfaction (1-5 Stars)',
    'Infrastructure Health Score (0-100)',
    'Health Grade',
    'Budget Allocation Priority',
    'Primary Infrastructure Backlog',
    'Councilor Office',
    'Helpline',
  ]

  const rows = wardScorecards.map((w) => [
    w.wardId,
    w.wardName,
    w.zoneName,
    w.totalIssues,
    w.resolvedIssues,
    w.openIssues,
    w.averageResolutionTimeHours,
    `${w.slaComplianceRate}%`,
    w.citizenSatisfactionStars,
    w.healthScore,
    w.healthGrade,
    w.budgetPriority,
    w.topCategory,
    w.councilorOffice,
    w.helpline,
  ])

  const csvContent = toCsv(headers, rows)
  const filename = `ward-infrastructure-health-scorecard-${formatDateStamp(now)}.csv`
  downloadCsv(filename, csvContent)
}
