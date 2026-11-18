import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DISPATCH_WEIGHTS,
  DEFAULT_MAX_CAPACITY,
  calculateProximityScore,
  calculateSlaScore,
  calculateSpecializationScore,
  calculateWorkloadScore,
  evaluateCandidateOfficer,
  normalizeWeights,
  rankCandidateOfficers,
} from './officerDispatch'

describe('Officer Dispatch Scoring Engine', () => {
  describe('Weight Normalization', () => {
    it('normalizes custom weights to sum to 1.0 (100%)', () => {
      const custom = { workload: 40, proximity: 30, specialization: 20, sla: 10 }
      const normalized = normalizeWeights(custom)
      expect(normalized.workload + normalized.proximity + normalized.specialization + normalized.sla).toBeCloseTo(1.0)
      expect(normalized.workload).toBeCloseTo(0.4)
      expect(normalized.proximity).toBeCloseTo(0.3)
      expect(normalized.specialization).toBeCloseTo(0.2)
      expect(normalized.sla).toBeCloseTo(0.1)
    })

    it('falls back safely to default weights if weights are invalid or zero', () => {
      const normalized = normalizeWeights({ workload: 0, proximity: 0, specialization: 0, sla: 0 })
      expect(normalized.workload).toBe(DEFAULT_DISPATCH_WEIGHTS.workload)
      expect(normalized.proximity).toBe(DEFAULT_DISPATCH_WEIGHTS.proximity)
      expect(normalized.specialization).toBe(DEFAULT_DISPATCH_WEIGHTS.specialization)
      expect(normalized.sla).toBe(DEFAULT_DISPATCH_WEIGHTS.sla)
    })
  })

  describe('Workload Factor', () => {
    it('gives score 100 to an officer with zero active workload', () => {
      const res = calculateWorkloadScore(0, 10)
      expect(res.score).toBe(100)
      expect(res.eligible).toBe(true)
      expect(res.activeCount).toBe(0)
    })

    it('decreases workload score as utilization increases', () => {
      const low = calculateWorkloadScore(2, 10)
      const medium = calculateWorkloadScore(5, 10)
      const high = calculateWorkloadScore(8, 10)

      expect(low.score).toBe(80)
      expect(medium.score).toBe(50)
      expect(high.score).toBe(20)
      expect(low.score).toBeGreaterThan(medium.score)
      expect(medium.score).toBeGreaterThan(high.score)
    })

    it('marks officer at maximum capacity as ineligible with score 0', () => {
      const res = calculateWorkloadScore(10, 10)
      expect(res.score).toBe(0)
      expect(res.eligible).toBe(false)
      expect(res.explanation).toContain('maximum capacity')
    })

    it('marks officer over capacity as ineligible with score 0', () => {
      const res = calculateWorkloadScore(14, 10)
      expect(res.score).toBe(0)
      expect(res.eligible).toBe(false)
    })

    it('handles negative or invalid counts safely', () => {
      const res = calculateWorkloadScore(-3, 10)
      expect(res.score).toBe(100)
      expect(res.activeCount).toBe(0)
    })

    it('applies default capacity when capacity is missing or zero', () => {
      const res = calculateWorkloadScore(5, 0)
      expect(res.maxCapacity).toBe(DEFAULT_MAX_CAPACITY)
      expect(res.score).toBe(50)
    })
  })

  describe('Proximity Factor', () => {
    it('calculates exact Haversine distance and gives high score for nearby coords', () => {
      // 0.5km apart
      const compLoc = { latitude: 22.5726, longitude: 88.3639 }
      const offLoc = { latitude: 22.5746, longitude: 88.3659 }
      const res = calculateProximityScore(compLoc, offLoc)

      expect(res.verified).toBe(true)
      expect(res.distanceKm).toBeLessThan(1)
      expect(res.score).toBe(100)
    })

    it('decreases score as physical distance increases', () => {
      const origin = { latitude: 22.5726, longitude: 88.3639 }
      const near = { latitude: 22.5926, longitude: 88.3639 } // ~2.2 km
      const far = { latitude: 22.8000, longitude: 88.3639 } // ~25 km

      const resNear = calculateProximityScore(origin, near)
      const resFar = calculateProximityScore(origin, far)

      expect(resNear.score).toBeGreaterThan(resFar.score)
      expect(resNear.verified).toBe(true)
      expect(resFar.verified).toBe(true)
    })

    it('falls back to ward matching when coordinates are invalid or missing', () => {
      const match = calculateProximityScore(null, null, 'Ward 04', 'Ward 04')
      expect(match.verified).toBe(false)
      expect(match.score).toBe(85)
      expect(match.explanation).toContain('ward match')

      const crossWard = calculateProximityScore(null, null, 'Ward 04', 'Ward 12')
      expect(crossWard.verified).toBe(false)
      expect(crossWard.score).toBe(30)
      expect(crossWard.explanation).toContain('Cross-ward')
    })

    it('returns neutral baseline when both coordinates and wards are missing', () => {
      const res = calculateProximityScore(null, null, null, null)
      expect(res.verified).toBe(false)
      expect(res.score).toBe(50)
      expect(res.explanation).toContain('unavailable')
    })

    it('rejects out-of-range coordinates gracefully without crashing', () => {
      const res = calculateProximityScore({ latitude: 120, longitude: 250 }, { latitude: 22, longitude: 88 })
      expect(res.verified).toBe(false)
      expect(res.score).toBe(50)
    })
  })

  describe('Specialization Factor', () => {
    it('awards 100 for exact department and category specialization match', () => {
      const complaint = { department: 'Roads', category: 'Potholes & Road Damage' }
      const officer = { department: 'Roads', specializations: ['Potholes & Road Damage', 'Drainage'] }
      const res = calculateSpecializationScore(complaint, officer)

      expect(res.score).toBe(100)
      expect(res.matchType).toBe('exact')
      expect(res.explanation).toContain('Exact department')
    })

    it('awards 80 for department match without specific category specialization', () => {
      const complaint = { department: 'Roads', category: 'Potholes & Road Damage' }
      const officer = { department: 'Roads', specializations: ['Bridges'] }
      const res = calculateSpecializationScore(complaint, officer)

      expect(res.score).toBe(80)
      expect(res.matchType).toBe('department')
    })

    it('awards 75 for category match without department match', () => {
      const complaint = { department: '', category: 'Water Leakage' }
      const officer = { department: '', specializations: ['Water Leakage'] }
      const res = calculateSpecializationScore(complaint, officer)

      expect(res.score).toBe(75)
      expect(res.matchType).toBe('category')
    })

    it('awards low score for explicit cross-department mismatch', () => {
      const complaint = { department: 'Roads', category: 'Potholes' }
      const officer = { department: 'Electricity', specializations: ['Streetlights'] }
      const res = calculateSpecializationScore(complaint, officer)

      expect(res.score).toBe(20)
      expect(res.matchType).toBe('cross-department')
    })

    it('returns neutral score when no qualifications are configured', () => {
      const res = calculateSpecializationScore({}, {})
      expect(res.score).toBe(50)
      expect(res.matchType).toBe('neutral')
    })
  })

  describe('SLA Factor', () => {
    it('returns verified SLA score based on historical on-time resolution rate', () => {
      const stats = { totalResolved: 20, onTimeResolved: 18 }
      const res = calculateSlaScore(stats, 'Medium')

      expect(res.verified).toBe(true)
      expect(res.score).toBe(90)
      expect(res.onTimeRate).toBe(0.9)
    })

    it('penalizes low on-time rate for High/Critical priority complaints', () => {
      const stats = { totalResolved: 10, onTimeResolved: 6 } // 60% on-time
      const normalRes = calculateSlaScore(stats, 'Low')
      const urgentRes = calculateSlaScore(stats, 'High')

      expect(normalRes.score).toBe(60)
      expect(urgentRes.score).toBe(45) // 60 - 15 penalty
    })

    it('returns score 0 and verified false when historical record is missing or zero', () => {
      const res = calculateSlaScore(null)
      expect(res.verified).toBe(false)
      expect(res.available).toBe(false)
      expect(res.score).toBe(0)
      expect(res.totalResolved).toBe(0)

      const zeroRes = calculateSlaScore({ totalResolved: 0 })
      expect(zeroRes.verified).toBe(false)
      expect(zeroRes.score).toBe(0)
    })

    it('handles invalid or non-object historical records safely', () => {
      expect(calculateSlaScore('invalid').score).toBe(0)
      expect(calculateSlaScore({ totalResolved: -5 }).score).toBe(0)
      expect(calculateSlaScore(undefined).available).toBe(false)
    })

    it('redistributes SLA weight when SLA data is unavailable during candidate evaluation', () => {
      const candidate = {
        id: 'off-test',
        name: 'Officer New',
        active: true,
        activeComplaints: 0,
        maxCapacity: 10,
        historicalStats: null,
      }
      const evalRes = evaluateCandidateOfficer(candidate, { department: 'Roads' })
      expect(evalRes.eligible).toBe(true)
      expect(evalRes.breakdown.sla.verified).toBe(false)
      expect(evalRes.breakdown.sla.weight).toBe(0)
      // Workload, proximity, specialization weights should sum to 1.0
      const totalWeight =
        evalRes.breakdown.workload.weight +
        evalRes.breakdown.proximity.weight +
        evalRes.breakdown.specialization.weight
      expect(Math.round(totalWeight * 100) / 100).toBe(1)
    })
  })

  describe('Candidate Evaluation & Ranking', () => {
    it('evaluates and excludes inactive officers', () => {
      const inactiveOfficer = {
        id: 'off-1',
        name: 'Officer A',
        active: false,
        activeComplaints: 2,
        maxCapacity: 10,
      }
      const evalRes = evaluateCandidateOfficer(inactiveOfficer, { department: 'Roads' })
      expect(evalRes.eligible).toBe(false)
      expect(evalRes.score).toBe(0)
      expect(evalRes.disqualificationReason).toContain('inactive')
    })

    it('evaluates and excludes full-capacity officers', () => {
      const busyOfficer = {
        id: 'off-2',
        name: 'Officer B',
        active: true,
        activeComplaints: 10,
        maxCapacity: 10,
      }
      const evalRes = evaluateCandidateOfficer(busyOfficer, { department: 'Roads' })
      expect(evalRes.eligible).toBe(false)
      expect(evalRes.score).toBe(0)
      expect(evalRes.disqualificationReason).toContain('capacity')
    })

    it('computes deterministic normalized score between 0 and 100 with breakdown', () => {
      const officer = {
        id: 'off-3',
        name: 'Officer C',
        active: true,
        activeComplaints: 1,
        maxCapacity: 10,
        department: 'Roads',
        specializations: ['Potholes & Road Damage'],
        location: { latitude: 22.5726, longitude: 88.3639 },
        historicalStats: { totalResolved: 10, onTimeResolved: 9 },
      }
      const complaint = {
        department: 'Roads',
        category: 'Potholes & Road Damage',
        latitude: 22.5730,
        longitude: 88.3640,
        priority: 'High',
      }

      const res = evaluateCandidateOfficer(officer, complaint)
      expect(res.eligible).toBe(true)
      expect(res.score).toBeGreaterThanOrEqual(0)
      expect(res.score).toBeLessThanOrEqual(100)
      expect(res.breakdown.workload.contribution).toBeDefined()
      expect(res.breakdown.proximity.contribution).toBeDefined()
      expect(res.breakdown.specialization.contribution).toBeDefined()
      expect(res.breakdown.sla.contribution).toBeDefined()
      expect(Number.isNaN(res.score)).toBe(false)
    })

    it('ranks eligible candidates by score and picks top 3 deterministically', () => {
      const candidates = [
        { id: 'off-1', name: 'Officer Low', active: true, activeComplaints: 8, maxCapacity: 10, department: 'Water' },
        { id: 'off-2', name: 'Officer Best', active: true, activeComplaints: 0, maxCapacity: 10, department: 'Roads', specializations: ['Potholes'] },
        { id: 'off-3', name: 'Officer Mid', active: true, activeComplaints: 3, maxCapacity: 10, department: 'Roads' },
        { id: 'off-4', name: 'Officer Inactive', active: false, activeComplaints: 1, maxCapacity: 10 },
        { id: 'off-5', name: 'Officer Full', active: true, activeComplaints: 10, maxCapacity: 10 },
      ]

      const complaint = { department: 'Roads', category: 'Potholes' }
      const ranking = rankCandidateOfficers(candidates, complaint)

      expect(ranking.recommendations).toHaveLength(3)
      expect(ranking.recommendations[0].officerId).toBe('off-2')
      expect(ranking.recommendations[1].officerId).toBe('off-3')
      expect(ranking.recommendations[2].officerId).toBe('off-1')
      expect(ranking.disqualifiedCandidates).toHaveLength(2)
    })

    it('breaks ties deterministically using workload, proximity, and officer ID', () => {
      const candidates = [
        { id: 'off-z', name: 'Officer Z', active: true, activeComplaints: 2, maxCapacity: 10, department: 'Roads' },
        { id: 'off-a', name: 'Officer A', active: true, activeComplaints: 2, maxCapacity: 10, department: 'Roads' },
      ]

      const ranking = rankCandidateOfficers(candidates, { department: 'Roads' })
      expect(ranking.recommendations[0].officerId).toBe('off-a')
      expect(ranking.recommendations[1].officerId).toBe('off-z')
    })

    it('handles empty or missing candidates list gracefully', () => {
      const ranking = rankCandidateOfficers([], {})
      expect(ranking.recommendations).toEqual([])
      expect(ranking.eligibleCandidates).toEqual([])
      expect(ranking.disqualifiedCandidates).toEqual([])
    })
  })
})
