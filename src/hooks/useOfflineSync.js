import { useEffect, useCallback, useRef } from 'react'
import { auth } from '@/firebase/services'
import { syncOfflineComplaint } from '@/firebase/offlineComplaintSync'
import { useAuth } from '@/hooks/useAuth'
import { withOfflineSyncLock } from '@/utils/syncLock'
import * as offlineQueue from '@/utils/offlineQueue'

export function useOfflineSync() {
  const { user } = useAuth()
  const syncingRef = useRef(null)

  const syncComplaints = useCallback(async () => {
    const session = auth.currentUser
    if (
      typeof navigator === 'undefined' ||
      !navigator.onLine ||
      !session || session.uid !== user?.uid ||
      syncingRef.current === session
    ) {
      return
    }

    syncingRef.current = session

    try {
      await withOfflineSyncLock(async () => {
        const pendingComplaints = await offlineQueue.getPendingComplaints(session.uid)

        for (const complaint of pendingComplaints) {
          if (!navigator.onLine || auth.currentUser !== session) break

          try {
            await offlineQueue.markComplaintSyncing?.(complaint.localId)
            await syncOfflineComplaint(complaint, session)
            await offlineQueue.removeOfflineComplaint(complaint.localId)

            console.log(
              'Offline complaint synchronized:',
              complaint.localId
            )
          } catch (error) {
            await offlineQueue.markComplaintPending?.(complaint.localId)
            console.error(
              'Failed to synchronize complaint:',
              complaint.localId,
              error
            )
          }
        }
      })
    } catch (error) {
      console.error('Offline synchronization failed:', error)
    } finally {
      if (syncingRef.current === session) syncingRef.current = null
    }
  }, [user?.uid])

  useEffect(() => {
    window.addEventListener('online', syncComplaints)

    // Also check for pending complaints when the app opens.
    syncComplaints()

    return () => {
      window.removeEventListener('online', syncComplaints)
    }
  }, [syncComplaints])

  return { syncComplaints }
}
