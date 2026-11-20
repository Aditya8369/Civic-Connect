import { collection, getDocs } from 'firebase/firestore'
import { db } from './services'
import { haversineDistance, parseCoordinates } from '@/utils/geo'

/**
 * Default weights for multi-factor dispatch scoring.
 * Total sum must normalize to 1.0 (100%).
 *
 * Weight Rationale:
 * - Workload (0.35): Directly impacts service bandwidth and prevents field officer burnout.
 * - Proximity (0.30): Ensures rapid physical arrival for on-site municipal interventions.
 * - Specialization (0.25): Matches municipal department expertise to complaint categories.
 * - SLA (0.10): Leverages verified historical on-time resolution record when available.
 */
export const DEFAULT_DISPATCH_WEIGHTS = Object.freeze({
  workload: 0.35,
  proximity: 0.30,
  specialization: 0.25,
  sla: 0.10,
})

export const DEFAULT_MAX_CAPACITY = 10
export const ACTIVE_COMPLAINT_STATUSES = Object.freeze(['Pending', 'In Progress', 'Reopened'])

/**
 * Normalizes weights ensuring they sum to 1.0.
 */
export function normalizeWeights(weights = {}) {
  const merged = { ...DEFAULT_DISPATCH_WEIGHTS, ...weights }
  const total =
    (Number(merged.workload) || 0) +
    (Number(merged.proximity) || 0) +
    (Number(merged.specialization) || 0) +
    (Number(merged.sla) || 0)

  if (total <= 0) {
    return { ...DEFAULT_DISPATCH_WEIGHTS }
  }

  return {
    workload: (Number(merged.workload) || 0) / total,
    proximity: (Number(merged.proximity) || 0) / total,
    specialization: (Number(merged.specialization) || 0) / total,
    sla: (Number(merged.sla) || 0) / total,
  }
}

/**
 * Calculates Workload Score (0-100).
 * Decreases linearly as capacity utilization increases.
 * Officer at full capacity or over capacity receives 0 and is marked ineligible.
 */
export function calculateWorkloadScore(activeCount, maxCapacity = DEFAULT_MAX_CAPACITY) {
  const capacity = Number(maxCapacity) > 0 ? Number(maxCapacity) : DEFAULT_MAX_CAPACITY
  const count = Math.max(0, Number(activeCount) || 0)

  if (count >= capacity) {
    return {
      score: 0,
      eligible: false,
      utilizationRate: 1,
      activeCount: count,
      maxCapacity: capacity,
      explanation: `At maximum capacity (${count}/${capacity} active complaints)`,
    }
  }

  // Linear decay: 0 active complaints => 100 score; near capacity => low score
  const remainingRatio = (capacity - count) / capacity
  const score = Math.round(remainingRatio * 100)

  return {
    score: Math.min(100, Math.max(0, score)),
    eligible: true,
    utilizationRate: count / capacity,
    activeCount: count,
    maxCapacity: capacity,
    explanation: `${count} active complaint${count === 1 ? '' : 's'} out of ${capacity} capacity (${Math.round((count / capacity) * 100)}% utilized)`,
  }
}

/**
 * Calculates Proximity Score (0-100) based on Haversine distance in meters,
 * or ward/zone matching fallback if coordinates are unavailable.
 */
export function calculateProximityScore(complaintLocation, officerLocation, complaintWard = null, officerWard = null) {
  const pComp = parseCoordinates(complaintLocation)
  const pOff = parseCoordinates(officerLocation)

  if (pComp && pOff) {
    const distanceMeters = haversineDistance(pComp, pOff)
    if (distanceMeters !== null && !Number.isNaN(distanceMeters)) {
      const distanceKm = distanceMeters / 1000
      // Proximity score curve:
      // <= 1km: 100
      // 1km - 10km: decreases from 100 to 50
      // 10km - 30km: decreases from 50 to 10
      // > 30km: approaches 0
      let score = 0
      if (distanceKm <= 1) {
        score = 100
      } else if (distanceKm <= 10) {
        score = 100 - ((distanceKm - 1) / 9) * 50
      } else if (distanceKm <= 30) {
        score = 50 - ((distanceKm - 10) / 20) * 40
      } else {
        score = Math.max(0, 10 - (distanceKm - 30) * 0.5)
      }

      return {
        score: Math.round(Math.min(100, Math.max(0, score))),
        verified: true,
        distanceMeters: Math.round(distanceMeters),
        distanceKm: Number(distanceKm.toFixed(2)),
        explanation: `Verified distance: ${distanceKm < 1 ? Math.round(distanceMeters) + ' m' : distanceKm.toFixed(1) + ' km'}`,
      }
    }
  }

  // Fallback to ward matching if coordinates are missing or invalid
  const cleanCompWard = typeof complaintWard === 'string' ? complaintWard.trim().toLowerCase() : ''
  const cleanOffWard = typeof officerWard === 'string' ? officerWard.trim().toLowerCase() : ''

  if (cleanCompWard && cleanOffWard) {
    if (cleanCompWard === cleanOffWard) {
      return {
        score: 85,
        verified: false,
        distanceMeters: null,
        distanceKm: null,
        explanation: `Assigned ward match (${complaintWard})`,
      }
    }
    return {
      score: 30,
      verified: false,
      distanceMeters: null,
      distanceKm: null,
      explanation: `Cross-ward deployment (${complaintWard} vs ${officerWard})`,
    }
  }

  return {
    score: 50,
    verified: false,
    distanceMeters: null,
    distanceKm: null,
    explanation: 'Location data unavailable (neutral baseline applied)',
  }
}

/**
 * Calculates Specialization Score (0-100) based on department and category matching.
 */
export function calculateSpecializationScore(complaint = {}, officer = {}) {
  const compDept = (complaint?.department || '').trim().toLowerCase()
  const compCat = (complaint?.category || '').trim().toLowerCase()

  const offDept = (officer?.department || '').trim().toLowerCase()
  const offSpecializations = Array.isArray(officer?.specializations)
    ? officer.specializations.map((s) => String(s).trim().toLowerCase())
    : officer?.specialization
      ? [String(officer.specialization).trim().toLowerCase()]
      : []

  const hasSpecializations = offSpecializations.length > 0
  const categoryMatch = compCat && offSpecializations.some((spec) => spec === compCat || compCat.includes(spec) || spec.includes(compCat))
  const departmentMatch = compDept && offDept && compDept === offDept

  if (departmentMatch && categoryMatch) {
    return {
      score: 100,
      matchType: 'exact',
      explanation: `Exact department (${officer.department}) and category specialization match`,
    }
  }

  if (departmentMatch) {
    return {
      score: 80,
      matchType: 'department',
      explanation: `Department match (${officer.department})`,
    }
  }

  if (categoryMatch) {
    return {
      score: 75,
      matchType: 'category',
      explanation: `Category specialization match (${complaint.category})`,
    }
  }

  if (offDept && compDept && offDept !== compDept) {
    return {
      score: 20,
      matchType: 'cross-department',
      explanation: `Cross-department candidate (${officer.department} vs ${complaint.department})`,
    }
  }

  if (offDept || hasSpecializations) {
    return {
      score: 40,
      matchType: 'partial',
      explanation: `Partial qualification match`,
    }
  }

  return {
    score: 50,
    matchType: 'neutral',
    explanation: 'No specific departmental specialization configured (neutral baseline)',
  }
}

/**
 * Calculates SLA performance score (0-100) from verified historical records.
 *
 * Missing or insufficient data policy:
 * - Historical performance is calculated strictly from verified records with totalResolved > 0.
 * - Missing or invalid track records return score: 0 and verified: false.
 * - Missing records do NOT receive an arbitrary baseline score (e.g. 70) and do NOT receive
 *   an unearned competitive advantage over measured officers.
 * - The factor weight dynamically normalizes across available/verified factors during candidate evaluation.
 */
export function calculateSlaScore(officerHistoricalStats = null, priority = 'Medium') {
  if (
    !officerHistoricalStats ||
    typeof officerHistoricalStats !== 'object' ||
    typeof officerHistoricalStats.totalResolved !== 'number' ||
    officerHistoricalStats.totalResolved <= 0
  ) {
    return {
      score: 0,
      verified: false,
      available: false,
      onTimeRate: null,
      totalResolved: 0,
      onTimeResolved: 0,
      explanation: 'No verified historical SLA resolution track record available',
    }
  }

  const { totalResolved, onTimeResolved = 0 } = officerHistoricalStats
  const safeOnTime = Math.min(totalResolved, Math.max(0, onTimeResolved))
  const onTimeRate = safeOnTime / totalResolved
  let score = Math.round(onTimeRate * 100)

  // For High / Critical / Urgent priority complaints, weight on-time reliability more stringently
  const isHighPriority = String(priority).toLowerCase() === 'high' || String(priority).toLowerCase() === 'critical'

  if (isHighPriority && onTimeRate < 0.8) {
    score = Math.max(0, score - 15)
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    verified: true,
    available: true,
    onTimeRate: Number(onTimeRate.toFixed(2)),
    totalResolved,
    onTimeResolved: safeOnTime,
    explanation: `Verified on-time resolution rate: ${Math.round(onTimeRate * 100)}% (${safeOnTime}/${totalResolved} resolved on-time)`,
  }
}

/**
 * Evaluates candidate dispatch score against a specific complaint.
 */
export function evaluateCandidateOfficer(candidate, complaint, customWeights = {}) {
  const weights = normalizeWeights(customWeights)

  const active = candidate?.active !== false
  const activeCount = candidate?.activeComplaints ?? candidate?.activeCount ?? 0
  const maxCapacity = candidate?.maxCapacity ?? candidate?.capacity ?? DEFAULT_MAX_CAPACITY

  const workload = calculateWorkloadScore(activeCount, maxCapacity)

  const proximity = calculateProximityScore(
    complaint?.location || { latitude: complaint?.latitude, longitude: complaint?.longitude },
    candidate?.location || { latitude: candidate?.latitude, longitude: candidate?.longitude },
    complaint?.ward,
    candidate?.ward
  )

  const specialization = calculateSpecializationScore(complaint, candidate)
  const sla = calculateSlaScore(candidate?.historicalStats, complaint?.priority)

  // Inactive officer or full capacity makes candidate ineligible
  const eligible = active && workload.eligible

  let disqualificationReason = null
  if (!active) {
    disqualificationReason = 'Officer is currently marked inactive or off-duty'
  } else if (!workload.eligible) {
    disqualificationReason = `Officer has reached full capacity (${activeCount}/${maxCapacity})`
  }

  // Evaluate factor scores
  const rawWorkload = workload.score
  const rawProximity = proximity.score
  const rawSpecialization = specialization.score
  const rawSla = sla.score

  // If SLA is unverified / unavailable, redistribute its weight proportionally across
  // verified factors (workload, proximity, specialization) so unverified officers do not
  // suffer an arbitrary penalty nor receive an arbitrary advantage.
  let effectiveWeights = { ...weights }
  if (!sla.verified) {
    const verifiedSum = weights.workload + weights.proximity + weights.specialization
    if (verifiedSum > 0) {
      effectiveWeights = {
        workload: weights.workload / verifiedSum,
        proximity: weights.proximity / verifiedSum,
        specialization: weights.specialization / verifiedSum,
        sla: 0,
      }
    }
  }

  const rawScore =
    rawWorkload * effectiveWeights.workload +
    rawProximity * effectiveWeights.proximity +
    rawSpecialization * effectiveWeights.specialization +
    (sla.verified ? rawSla * effectiveWeights.sla : 0)

  const finalScore = eligible ? Math.min(100, Math.max(0, Math.round(rawScore))) : 0

  return {
    officerId: candidate.id || candidate.officerId || candidate.uid,
    name: candidate.name || candidate.displayName || 'Field Officer',
    email: candidate.email || null,
    phone: candidate.phone || null,
    department: candidate.department || null,
    ward: candidate.ward || null,
    score: finalScore,
    eligible,
    disqualificationReason,
    activeCount: workload.activeCount,
    maxCapacity: workload.maxCapacity,
    utilizationRate: workload.utilizationRate,
    breakdown: {
      workload: {
        score: workload.score,
        weight: Number(effectiveWeights.workload.toFixed(4)),
        contribution: Number((workload.score * effectiveWeights.workload).toFixed(2)),
        explanation: workload.explanation,
      },
      proximity: {
        score: proximity.score,
        weight: Number(effectiveWeights.proximity.toFixed(4)),
        contribution: Number((proximity.score * effectiveWeights.proximity).toFixed(2)),
        verified: proximity.verified,
        distanceKm: proximity.distanceKm,
        explanation: proximity.explanation,
      },
      specialization: {
        score: specialization.score,
        weight: Number(effectiveWeights.specialization.toFixed(4)),
        contribution: Number((specialization.score * effectiveWeights.specialization).toFixed(2)),
        matchType: specialization.matchType,
        explanation: specialization.explanation,
      },
      sla: {
        score: sla.score,
        weight: Number(effectiveWeights.sla.toFixed(4)),
        contribution: Number((sla.score * effectiveWeights.sla).toFixed(2)),
        verified: sla.verified,
        available: sla.available,
        explanation: sla.explanation,
      },
    },
  }
}

/**
 * Ranks all candidate officers and returns sorted list with top recommendations.
 */
export function rankCandidateOfficers(candidates = [], complaint = {}, weights = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      recommendations: [],
      eligibleCandidates: [],
      disqualifiedCandidates: [],
    }
  }

  const evaluated = candidates.map((cand) => evaluateCandidateOfficer(cand, complaint, weights))

  const eligibleCandidates = evaluated.filter((c) => c.eligible)
  const disqualifiedCandidates = evaluated.filter((c) => !c.eligible)

  // Stable secondary sorting:
  // 1. Score desc
  // 2. Active workload asc (least busy first)
  // 3. Proximity score desc (closest first)
  // 4. Officer ID string asc (deterministic tie-breaker)
  eligibleCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount
    if (b.breakdown.proximity.score !== a.breakdown.proximity.score) {
      return b.breakdown.proximity.score - a.breakdown.proximity.score
    }
    return String(a.officerId).localeCompare(String(b.officerId))
  })

  return {
    recommendations: eligibleCandidates.slice(0, 3),
    eligibleCandidates,
    disqualifiedCandidates,
  }
}

/**
 * Loads available officer candidates from Firestore `officers` collection.
 * Also queries current active complaints if activeComplaints counter requires client verification.
 */
export async function fetchOfficerCandidates() {
  try {
    const snap = await getDocs(collection(db, 'officers'))
    const officers = []
    snap.forEach((docSnap) => {
      officers.push({ id: docSnap.id, ...docSnap.data() })
    })
    return officers
  } catch (error) {
    console.warn('Failed to fetch officer candidates from Firestore:', error)
    return []
  }
}
