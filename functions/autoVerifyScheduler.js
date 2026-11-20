/**
 * Auto-verification scheduled function and sweep processor for Issue #253.
 * Automatically verifies expired complaints in "Pending Verification" status.
 */

import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

export function getAdminDb() {
  const app = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
  return getFirestore(app)
}

/**
 * Sweep and atomically resolve all Pending Verification complaints whose 5-day review deadline has passed.
 *
 * Concurrency & Idempotency Safeguards:
 * 1. Queries strictly for `status == 'Pending Verification'` and `verificationDeadline <= now`.
 * 2. Processes each complaint inside an atomic Firestore transaction.
 * 3. Inside the transaction, re-reads the complaint from the server and validates:
 *    - Still exists
 *    - Status is STILL 'Pending Verification' (rejects if citizen disputed or accepted in the interim)
 *    - Verification deadline has genuinely expired against server time
 * 4. Atomically transitions to 'Resolved', sets `autoVerified: true`, records an audit event, and adds a notification.
 */
export async function processExpiredPendingVerifications(nowDate = new Date(), db = getAdminDb(), batchLimit = 100) {
  const nowTimestamp = Timestamp.fromDate(nowDate)

  // Query candidates whose deadline has elapsed (bounded batch limit)
  const querySnap = await db
    .collection('issues')
    .where('status', '==', 'Pending Verification')
    .where('verificationDeadline', '<=', nowTimestamp)
    .limit(batchLimit)
    .get()

  if (querySnap.empty) {
    return { processedCount: 0, autoVerifiedCount: 0, skippedCount: 0, errors: [] }
  }

  let autoVerifiedCount = 0
  let skippedCount = 0
  const errors = []

  for (const docSnap of querySnap.docs) {
    const issueRef = docSnap.ref
    const issueId = docSnap.id

    try {
      const outcome = await db.runTransaction(async (transaction) => {
        const freshSnap = await transaction.get(issueRef)
        if (!freshSnap.exists) {
          return { skipped: true, reason: 'Document deleted' }
        }

        const data = freshSnap.data() || {}

        // Crucial re-check: Citizen might have disputed or accepted concurrently
        if (data.status !== 'Pending Verification') {
          return { skipped: true, reason: `Status changed to ${data.status}` }
        }

        const deadline = data.verificationDeadline
        const deadlineMs = deadline?.toMillis ? deadline.toMillis() : (deadline?.seconds ? deadline.seconds * 1000 : null)

        if (!deadlineMs || deadlineMs > nowDate.getTime()) {
          return { skipped: true, reason: 'Deadline not expired in fresh snapshot' }
        }

        // Apply atomic resolution
        transaction.update(issueRef, {
          status: 'Resolved',
          autoVerified: true,
          autoVerifiedAt: FieldValue.serverTimestamp(),
          resolvedAt: FieldValue.serverTimestamp(),
          verificationOutcome: 'AUTO_VERIFIED',
          updatedAt: FieldValue.serverTimestamp(),
        })

        // Record immutable audit event in sub-collection
        const eventRef = issueRef.collection('events').doc()
        transaction.set(eventRef, {
          action: 'Resolution auto-verified',
          actorUid: 'system:auto-verifier',
          previousStatus: 'Pending Verification',
          newStatus: 'Resolved',
          remarks: 'Automatically resolved after 5-day citizen review window elapsed without dispute',
          timestamp: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        })

        // Notify citizen
        if (data.reportedBy) {
          const notifRef = db.collection('notifications').doc()
          transaction.set(notifRef, {
            recipientUid: data.reportedBy,
            recipientRole: 'citizen',
            senderUid: 'system',
            issueId: data.complaintId || issueId,
            type: 'status_update',
            title: 'Complaint Automatically Resolved',
            message: 'Your complaint was automatically marked resolved as the 5-day verification period concluded without dispute.',
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          })
        }

        return { autoVerified: true }
      })

      if (outcome.autoVerified) {
        autoVerifiedCount++
      } else {
        skippedCount++
      }
    } catch (err) {
      console.error(`[AutoVerifier] Error processing issue ${issueId}:`, err)
      errors.push({ issueId, error: err.message })
    }
  }

  return {
    processedCount: querySnap.size,
    autoVerifiedCount,
    skippedCount,
    errors,
  }
}

/**
 * Cloud Function scheduler trigger: Runs every hour to auto-verify expired complaints.
 */
export const autoVerifyExpiredResolutions = onSchedule(
  {
    schedule: 'every 1 hours',
    timeZone: 'UTC',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    console.log('[AutoVerifier] Starting scheduled resolution auto-verification sweep...')
    const result = await processExpiredPendingVerifications()
    console.log('[AutoVerifier] Sweep complete:', JSON.stringify(result))
    return result
  }
)
