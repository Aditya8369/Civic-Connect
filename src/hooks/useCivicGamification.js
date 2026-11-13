import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import {
  computeCitizenBadges,
  computeCivicScore,
  computeCitizenLevel,
  computeCivicLeaderboard,
} from '@/utils/gamification'

/**
 * Persists a citizen's calculated civic score projection to the public leaderboard collection.
 * This decouples public leaderboard queries from private user profiles (/users/{userId})
 * to eliminate PII exposure and respect Firestore security rules.
 */
export async function syncUserLeaderboardEntry({
  user,
  score,
  badgesCount = 0,
  reportsCount = 0,
  customDb = db,
}) {
  if (!user?.uid) return null

  const monthlyScore = typeof score?.monthlyScore === 'number' ? score.monthlyScore : 0
  const allTimeScore = typeof score?.allTimeScore === 'number' ? score.allTimeScore : 0
  const name = user.displayName || user.name || 'Citizen'

  const leaderboardRef = doc(customDb, 'leaderboard', user.uid)
  const payload = {
    uid: user.uid,
    name,
    monthlyScore,
    allTimeScore,
    badgesCount: Math.max(0, Number(badgesCount) || 0),
    reportsCount: Math.max(0, Number(reportsCount) || 0),
    updatedAt: serverTimestamp(),
  }

  await setDoc(leaderboardRef, payload, { merge: true })
  return payload
}

/**
 * Computes and synchronizes a user's civic gamification score to /leaderboard/{userId}
 * on demand by fetching the user's filed and endorsed complaints.
 */
export async function syncUserLeaderboard({ user, customDb = db }) {
  if (!user?.uid) return null

  const [filedSnap, endorsedSnap] = await Promise.all([
    getDocs(query(collection(customDb, 'issues'), where('reportedBy', '==', user.uid))),
    getDocs(query(collection(customDb, 'issues'), where('endorsedBy', 'array-contains', user.uid))),
  ])

  const filedComplaints = filedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const endorsedComplaints = endorsedSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const scoreResult = computeCivicScore({ filedComplaints, endorsedComplaints })
  const badgesResult = computeCitizenBadges({ filedComplaints, endorsedComplaints })

  return syncUserLeaderboardEntry({
    user,
    score: scoreResult,
    badgesCount: badgesResult.stats.unlockedCount,
    reportsCount: filedComplaints.length,
    customDb,
  })
}

export function useCivicGamification(user, customDb = db) {
  const [filedComplaints, setFiledComplaints] = useState([])
  const [endorsedComplaints, setEndorsedComplaints] = useState([])
  const [communityParticipants, setCommunityParticipants] = useState([])
  const [loading, setLoading] = useState(Boolean(user?.uid))
  const [error, setError] = useState(null)
  const lastSyncPayloadRef = useRef('')

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false)
      return
    }

    let isMounted = true
    setLoading(true)

    // 1. Subscribe to user's filed complaints
    const filedQuery = query(
      collection(customDb, 'issues'),
      where('reportedBy', '==', user.uid)
    )

    const unsubFiled = onSnapshot(
      filedQuery,
      (snapshot) => {
        if (!isMounted) return
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setFiledComplaints(list)
        setLoading(false)
      },
      (err) => {
        console.warn('Error fetching filed complaints for gamification:', err)
        if (isMounted) {
          setError(err)
          setLoading(false)
        }
      }
    )

    // 2. Subscribe to user's endorsed complaints
    const endorsedQuery = query(
      collection(customDb, 'issues'),
      where('endorsedBy', 'array-contains', user.uid)
    )

    const unsubEndorsed = onSnapshot(
      endorsedQuery,
      (snapshot) => {
        if (!isMounted) return
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setEndorsedComplaints(list)
      },
      (err) => {
        console.warn('Error fetching endorsed complaints for gamification:', err)
      }
    )

    // 3. Fetch community participants from public leaderboard projection
    async function loadLeaderboardParticipants() {
      try {
        const leaderboardSnap = await getDocs(
          query(
            collection(customDb, 'leaderboard'),
            orderBy('monthlyScore', 'desc'),
            limit(15)
          )
        ).catch((err) => {
          console.warn('Error loading leaderboard participants:', err)
          return null
        })

        if (!isMounted) return

        let participants = []

        if (leaderboardSnap && !leaderboardSnap.empty) {
          participants = leaderboardSnap.docs.map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              name: data.name || data.displayName || 'Citizen',
              monthlyScore: typeof data.monthlyScore === 'number' ? data.monthlyScore : 0,
              allTimeScore: typeof data.allTimeScore === 'number' ? data.allTimeScore : 0,
              badgesCount: typeof data.badgesCount === 'number' ? data.badgesCount : 0,
              unlockedBadgesCount: typeof data.badgesCount === 'number' ? data.badgesCount : 0,
              reportsCount: typeof data.reportsCount === 'number' ? data.reportsCount : 0,
            }
          })
        }

        // Ensure current user is in participants
        const userExists = participants.some((p) => p.uid === user.uid)
        if (!userExists) {
          participants.push({
            uid: user.uid,
            name: user.displayName || user.name || 'You',
          })
        }

        setCommunityParticipants(participants)
      } catch (err) {
        console.warn('Error loading leaderboard participants:', err)
      }
    }

    loadLeaderboardParticipants()

    return () => {
      isMounted = false
      unsubFiled()
      unsubEndorsed()
    }
  }, [user?.uid, user?.name, user?.displayName, customDb])

  // Compute live gamification state
  const badgesResult = computeCitizenBadges({
    filedComplaints,
    endorsedComplaints,
  })

  const scoreResult = computeCivicScore({
    filedComplaints,
    endorsedComplaints,
  })

  const levelResult = computeCitizenLevel(scoreResult.allTimeScore)

  // 4. Synchronize current citizen's live score to public leaderboard projection
  useEffect(() => {
    if (!user?.uid || loading) return

    const name = user.displayName || user.name || 'Citizen'
    const syncKey = `${user.uid}:${name}:${scoreResult.monthlyScore}:${scoreResult.allTimeScore}:${badgesResult.stats.unlockedCount}:${filedComplaints.length}`
    if (lastSyncPayloadRef.current === syncKey) return

    let isSyncMounted = true

    async function sync() {
      try {
        await syncUserLeaderboardEntry({
          user,
          score: {
            monthlyScore: scoreResult.monthlyScore,
            allTimeScore: scoreResult.allTimeScore,
          },
          badgesCount: badgesResult.stats.unlockedCount,
          reportsCount: filedComplaints.length,
          customDb,
        })
        if (isSyncMounted) {
          lastSyncPayloadRef.current = syncKey
        }
      } catch (err) {
        if (isSyncMounted) {
          console.warn('Error syncing citizen leaderboard entry:', err)
        }
      }
    }

    sync()

    return () => {
      isSyncMounted = false
    }
  }, [
    user,
    loading,
    scoreResult.monthlyScore,
    scoreResult.allTimeScore,
    badgesResult.stats.unlockedCount,
    filedComplaints.length,
    customDb,
  ])

  // Inject current user's computed score into leaderboard participant list
  const fullParticipants = communityParticipants.map((p) => {
    if (p.uid === user?.uid) {
      return {
        ...p,
        monthlyScore: scoreResult.monthlyScore,
        allTimeScore: scoreResult.allTimeScore,
        filedComplaints,
        endorsedComplaints,
        unlockedBadgesCount: badgesResult.stats.unlockedCount,
      }
    }
    return p
  })

  // If no other community participants yet, make sure current user is still represented
  if (fullParticipants.length === 0 && user?.uid) {
    fullParticipants.push({
      uid: user.uid,
      name: user.displayName || user.name || 'You',
      monthlyScore: scoreResult.monthlyScore,
      allTimeScore: scoreResult.allTimeScore,
      filedComplaints,
      endorsedComplaints,
      unlockedBadgesCount: badgesResult.stats.unlockedCount,
    })
  }

  const leaderboardResult = computeCivicLeaderboard(fullParticipants, {
    currentUserId: user?.uid,
  })

  return {
    loading,
    error,
    badges: badgesResult.badges,
    badgeStats: badgesResult.stats,
    score: scoreResult,
    level: levelResult,
    leaderboard: leaderboardResult.leaderboard,
    currentUserRank: leaderboardResult.currentUserRank,
    stats: {
      totalFiled: filedComplaints.length,
      totalEndorsed: endorsedComplaints.length,
      totalResolved: scoreResult.breakdown.totalResolved,
      totalEndorsementsReceived: scoreResult.breakdown.totalEndorsementsReceived,
    },
    syncLeaderboard: () =>
      syncUserLeaderboardEntry({
        user,
        score: scoreResult,
        badgesCount: badgesResult.stats.unlockedCount,
        reportsCount: filedComplaints.length,
        customDb,
      }),
  }
}
