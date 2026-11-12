import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { sortByCreatedAtDesc } from '@/utils/sortByCreatedAtDesc'
import { isUnconfirmedEmpty } from '@/firebase/snapshot'

/**
 * Hook to fetch complaints for Spotlight Search with role-based access control.
 * Subscribes to Firestore only when active (`enabled === true`).
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether the modal is open and should fetch data
 * @param {Array|null} options.overrideReports - Optional reports for testing or preloaded data
 * @returns {{ reports: Array, loading: boolean, error: boolean, retry: () => void }}
 */
export function useSpotlightReports({ enabled = false, overrideReports = null } = {}) {
  const { user } = useAuth()
  const [reports, setReports] = useState(() =>
    Array.isArray(overrideReports) ? overrideReports : []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const unsubRef = useRef(null)

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1)
  }, [])

  useEffect(() => {
    // If override reports are provided (e.g. in tests), use them directly
    if (overrideReports !== null && overrideReports !== undefined) {
      setReports(overrideReports)
      setLoading(false)
      setError(false)
      return
    }

    // Do not fetch if not enabled or no user
    if (!enabled || !user) {
      if (!user) {
        setReports([])
      }
      setLoading(false)
      return
    }

    setLoading(true)
    setError(false)

    try {
      let q
      if (user.role === 'admin') {
        // Admin can view all complaints
        q = query(collection(db, 'issues'))
      } else {
        // Citizens can ONLY view their own reported complaints
        q = query(collection(db, 'issues'), where('reportedBy', '==', user.uid))
      }

      const unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snapshot) => {
          if (isUnconfirmedEmpty(snapshot)) {
            if (typeof navigator !== 'undefined' && !navigator.onLine) {
              setError(true)
              setLoading(false)
            }
            return
          }

          const docs = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          }))

          setReports(sortByCreatedAtDesc(docs))
          setError(false)
          setLoading(false)
        },
        (err) => {
          console.error('Spotlight search Firestore error:', err)
          setError(true)
          setLoading(false)
        }
      )

      unsubRef.current = unsubscribe

      return () => {
        if (unsubscribe) {
          unsubscribe()
        }
      }
    } catch (err) {
      console.error('Failed to initialize Spotlight query:', err)
      setError(true)
      setLoading(false)
    }
  }, [enabled, user, retryCount, overrideReports])

  return { reports, loading, error, retry }
}
