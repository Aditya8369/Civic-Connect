import { useEffect, useCallback, useRef } from 'react'
import {
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'

import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'

import {
  getPendingComplaints,
  removeOfflineComplaint,
} from '@/utils/offlineQueue'

import { generateComplaintId } from '@/firebase/complaintId'
import { addNotificationToBatch } from '@/firebase/notifications'
import { addComplaintEventToBatch } from '@/firebase/complaintEvents'

export function useOfflineSync() {
  const { user } = useAuth()
  const syncingRef = useRef(false)

  const syncComplaints = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.onLine ||
      !user?.uid ||
      syncingRef.current
    ) {
      return
    }

    syncingRef.current = true

    try {
      const pendingComplaints = await getPendingComplaints(user.uid)

      for (const complaint of pendingComplaints) {
        if (!navigator.onLine) break

        try {
          // Generate the same complaint ID format as online submissions.
          const complaintId = await generateComplaintId()

          // Use the local ID as the Firestore document ID.
          const issueRef = doc(db, 'issues', complaint.localId)

          const batch = writeBatch(db)

          // Keep the existing online complaint schema.
          batch.set(issueRef, {
            complaintId,
            title: complaint.title,
            description: complaint.description,
            category: complaint.category,
            address: complaint.address,
            latitude: complaint.latitude ?? null,
            longitude: complaint.longitude ?? null,
            status: 'Pending',
            department: '',
            reportedBy: user.uid,
            imageUrl: null,
            photos: [],
            endorsedBy: [],
            endorsementCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

          // Record complaint submission activity.
          addComplaintEventToBatch(batch, issueRef.id, {
            actorUid: user.uid,
            action: 'Complaint submitted',
            previousStatus: null,
            newStatus: 'Pending',
            remarks: complaint.description || 'Complaint submitted',
          })

          // Notify administrators.
          addNotificationToBatch(batch, {
            recipientRole: 'admin',
            senderUid: user.uid,
            issueId: complaintId,
            type: 'new_complaint',
            title: 'New Complaint Submitted',
            message: 'A citizen has submitted a new complaint.',
          })

          // Commit complaint, event and notification together.
          await batch.commit()

          // Remove the local record only after a successful commit.
          await removeOfflineComplaint(complaint.localId)

          console.log(
            'Offline complaint synchronized:',
            complaint.localId
          )
        } catch (error) {
          console.error(
            'Failed to synchronize complaint:',
            complaint.localId,
            error
          )
        }
      }
    } catch (error) {
      console.error('Offline synchronization failed:', error)
    } finally {
      syncingRef.current = false
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