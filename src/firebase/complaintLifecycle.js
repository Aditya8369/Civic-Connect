import { doc, collection, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './services'
import { addNotificationToBatch } from './notifications'
import { buildComplaintEvent } from './complaintEvents'

export const VERIFICATION_WINDOW_DAYS = 5
export const VERIFICATION_WINDOW_MS = VERIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000

export const DISPUTE_REASONS = Object.freeze([
  'WORK_INCOMPLETE',
  'INCORRECT_LOCATION',
  'POOR_QUALITY',
  'OTHER',
])

export function commitComplaintTransition(
  id,
  expectedStatus,
  changes,
  notificationFor,
  canTransition = () => true,
  eventFor = null
) {
  const ref = doc(db, 'issues', id)
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref)
    const complaint = snapshot.data()
    if (!complaint || complaint.status !== expectedStatus || !canTransition(complaint)) {
      throw new Error('Complaint is no longer eligible for this transition')
    }
    const notification = notificationFor(complaint)
    transaction.update(ref, changes)
    if (notification) addNotificationToBatch(transaction, notification)
    if (eventFor) {
      const eventData = typeof eventFor === 'function' ? eventFor(complaint) : eventFor
      if (eventData) {
        const eventRef = doc(collection(db, `issues/${id}/events`))
        transaction.set(eventRef, buildComplaintEvent(eventData))
      }
    }
  })
}

/**
 * Submits resolution proof and moves complaint from In Progress to Pending Verification.
 *
 * Validates:
 * - Complaint exists and is In Progress (or Reopened)
 * - Actor is admin or assigned officer
 * - Resolution notes are non-empty
 * - Valid resolution proof exists with approved path: complaint-resolution-proof/{complaintId}/{filename}
 */
export async function submitResolutionForVerification(
  complaintId,
  resolutionData = {},
  actor = {},
  customDb = db
) {
  if (!complaintId) throw new Error('Complaint ID is required')
  if (!actor || !actor.uid) throw new Error('Authenticated actor is required')

  const notes = (resolutionData.notes || resolutionData.resolutionNotes || '').trim()
  if (!notes) {
    throw new Error('Resolution completion notes are required')
  }

  const proof = resolutionData.proof || resolutionData.resolutionProof
  if (!proof || !proof.path || !proof.downloadUrl) {
    throw new Error('Valid resolution proof photograph is required')
  }

  // Validate approved Storage path
  const expectedPathPrefix = `complaint-resolution-proof/${complaintId}/`
  if (!proof.path.startsWith(expectedPathPrefix)) {
    throw new Error(`Resolution proof must be stored under ${expectedPathPrefix}`)
  }

  const complaintRef = doc(customDb, 'issues', complaintId)

  return runTransaction(customDb, async transaction => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint does not exist')
    }
    const complaint = snap.data()

    if (!['In Progress', 'Reopened'].includes(complaint.status)) {
      throw new Error(`Complaint with status "${complaint.status}" cannot be submitted for verification`)
    }

    // Authorization check: Admin or assigned officer/worker
    const isAdmin = actor.role === 'admin'
    const assignedWorker = complaint.assignedWorker || {}
    const isAssignedOfficer =
      (complaint.assignedOfficerId && complaint.assignedOfficerId === actor.uid) ||
      (assignedWorker.officerId && assignedWorker.officerId === actor.uid) ||
      (assignedWorker.uid && assignedWorker.uid === actor.uid)

    if (!isAdmin && !isAssignedOfficer) {
      throw new Error('Only the assigned field officer or an administrator may submit resolution')
    }

    const nowMs = Date.now()
    const deadlineMs = nowMs + VERIFICATION_WINDOW_MS
    const deadlineTimestamp = Timestamp.fromMillis(deadlineMs)

    const proofMetadata = {
      downloadUrl: proof.downloadUrl,
      path: proof.path,
      filename: proof.filename || proof.path.split('/').pop(),
      contentType: proof.contentType || 'image/jpeg',
      size: proof.size || null,
      submittedBy: actor.uid,
      submittedAt: serverTimestamp(),
      officerName: actor.displayName || actor.name || assignedWorker.name || 'Field Officer',
    }

    const updates = {
      status: 'Pending Verification',
      resolutionNotes: notes,
      resolutionProof: proofMetadata,
      resolutionPhotos: [proof.downloadUrl], // Backward compatibility with ResolutionProofSlider
      submittedForVerificationAt: serverTimestamp(),
      verificationDeadline: deadlineTimestamp,
      verificationWorkflowVersion: 2,
      updatedAt: serverTimestamp(),
    }

    transaction.update(complaintRef, updates)

    // Audit event
    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: actor.uid,
        action: 'Resolution submitted for verification',
        previousStatus: complaint.status,
        newStatus: 'Pending Verification',
        remarks: notes,
      })
    )

    // Notification to citizen
    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: actor.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Work Completed — Verification Needed',
        message: 'The field officer has completed work on your complaint. Please verify and accept or dispute within 5 days.',
        createdAt: serverTimestamp(),
      }, customDb)
    }

    return {
      success: true,
      status: 'Pending Verification',
      verificationDeadline: deadlineTimestamp,
      resolutionProof: proofMetadata,
    }
  })
}

/**
 * Citizen accepts the resolution proof, transitioning Pending Verification -> Resolved.
 */
export async function acceptComplaintResolution(
  complaintId,
  actor = {},
  feedbackData = null,
  customDb = db
) {
  if (!complaintId) throw new Error('Complaint ID is required')
  if (!actor || !actor.uid) throw new Error('Authenticated actor is required')

  const complaintRef = doc(customDb, 'issues', complaintId)

  return runTransaction(customDb, async transaction => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint does not exist')
    }
    const complaint = snap.data()

    if (complaint.status !== 'Pending Verification') {
      throw new Error(`Complaint is not pending verification (current: ${complaint.status})`)
    }

    // Ownership check: only original reporter (or admin) can accept
    const isAdmin = actor.role === 'admin'
    const isReporter = complaint.reportedBy === actor.uid
    if (!isReporter && !isAdmin) {
      throw new Error('Only the citizen who reported this complaint may accept the resolution')
    }

    // Deadline check
    const deadline = complaint.verificationDeadline
    const deadlineMs = deadline?.toMillis ? deadline.toMillis() : (deadline?.seconds ? deadline.seconds * 1000 : null)
    if (deadlineMs && Date.now() > deadlineMs) {
      throw new Error('The 5-day review period for this resolution has expired')
    }

    const updates = {
      status: 'Resolved',
      acceptedBy: actor.uid,
      acceptedAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    if (feedbackData && typeof feedbackData === 'object') {
      updates.feedback = {
        rating: Number(feedbackData.rating) || 5,
        comment: (feedbackData.comment || '').slice(0, 1000),
        tags: Array.isArray(feedbackData.tags) ? feedbackData.tags : [],
        submittedAt: serverTimestamp(),
      }
    }

    transaction.update(complaintRef, updates)

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: actor.uid,
        action: 'Resolution accepted',
        previousStatus: 'Pending Verification',
        newStatus: 'Resolved',
        remarks: feedbackData?.comment || 'Resolution verified and accepted by citizen',
      })
    )

    // Notify admin
    addNotificationToBatch(transaction, {
      recipientUid: null,
      recipientRole: 'admin',
      senderUid: actor.uid,
      issueId: complaint.complaintId || complaintId,
      type: 'status_update',
      title: 'Resolution Accepted by Citizen',
      message: `Citizen accepted the resolution for complaint: ${complaint.title}`,
      createdAt: serverTimestamp(),
    }, customDb)

    return { success: true, status: 'Resolved' }
  })
}

/**
 * Citizen disputes the resolution proof, transitioning Pending Verification -> Disputed.
 */
export async function disputeComplaintResolution(
  complaintId,
  disputeData = {},
  actor = {},
  customDb = db
) {
  if (!complaintId) throw new Error('Complaint ID is required')
  if (!actor || !actor.uid) throw new Error('Authenticated actor is required')

  const reason = disputeData.reason
  if (!reason || !DISPUTE_REASONS.includes(reason)) {
    throw new Error(`A valid dispute reason category is required (${DISPUTE_REASONS.join(', ')})`)
  }

  const explanation = (disputeData.explanation || '').trim()
  if (!explanation) {
    throw new Error('A detailed dispute explanation is required')
  }

  const evidence = disputeData.evidence || []
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error('Supporting dispute evidence is required')
  }

  // Validate approved Storage path
  const expectedPathPrefix = `complaint-disputes/${complaintId}/`
  for (const item of evidence) {
    if (!item.path || !item.path.startsWith(expectedPathPrefix)) {
      throw new Error(`Dispute evidence must be stored under ${expectedPathPrefix}`)
    }
  }

  const complaintRef = doc(customDb, 'issues', complaintId)

  return runTransaction(customDb, async transaction => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint does not exist')
    }
    const complaint = snap.data()

    if (complaint.status !== 'Pending Verification') {
      throw new Error(`Complaint is not pending verification (current: ${complaint.status})`)
    }

    // Ownership check: only original reporter (or admin) can dispute
    const isAdmin = actor.role === 'admin'
    const isReporter = complaint.reportedBy === actor.uid
    if (!isReporter && !isAdmin) {
      throw new Error('Only the citizen who reported this complaint may dispute the resolution')
    }

    // Deadline check
    const deadline = complaint.verificationDeadline
    const deadlineMs = deadline?.toMillis ? deadline.toMillis() : (deadline?.seconds ? deadline.seconds * 1000 : null)
    if (deadlineMs && Date.now() > deadlineMs) {
      throw new Error('The 5-day review period for this resolution has expired')
    }

    const currentDisputeCount = Number(complaint.disputeCount) || 0

    const record = {
      reason,
      explanation,
      evidence: evidence.map(e => ({
        downloadUrl: e.downloadUrl,
        path: e.path,
        filename: e.filename || e.path.split('/').pop(),
        contentType: e.contentType || 'image/jpeg',
      })),
      disputedBy: actor.uid,
      disputedAt: serverTimestamp(),
      status: 'UNDER_ADMIN_REVIEW',
    }

    const updates = {
      status: 'Disputed',
      dispute: record,
      disputedAt: serverTimestamp(),
      disputeCount: currentDisputeCount + 1,
      updatedAt: serverTimestamp(),
    }

    transaction.update(complaintRef, updates)

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: actor.uid,
        action: 'Resolution disputed',
        previousStatus: 'Pending Verification',
        newStatus: 'Disputed',
        remarks: `[${reason}] ${explanation}`,
      })
    )

    // Notify admin team of escalated dispute
    addNotificationToBatch(transaction, {
      recipientUid: null,
      recipientRole: 'admin',
      senderUid: actor.uid,
      issueId: complaint.complaintId || complaintId,
      type: 'status_update',
      title: 'Resolution Disputed by Citizen',
      message: `Citizen disputed the resolution (${reason}): ${explanation}`,
      createdAt: serverTimestamp(),
    }, customDb)

    return { success: true, status: 'Disputed' }
  })
}

/**
 * Administrative dispute review decision.
 *
 * Supported outcomes:
 * - 'UPHOLD_DISPUTE': Citizen dispute is justified. Moves complaint back to 'In Progress' for rework.
 * - 'REJECT_DISPUTE': Dispute is invalid/work verified. Transitions complaint to 'Resolved'.
 */
export async function reviewComplaintDispute(
  complaintId,
  decisionData = {},
  adminActor = {},
  customDb = db
) {
  if (!complaintId) throw new Error('Complaint ID is required')
  if (!adminActor || !adminActor.uid || adminActor.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may review disputes')
  }

  const outcome = decisionData.outcome
  if (!['UPHOLD_DISPUTE', 'REJECT_DISPUTE'].includes(outcome)) {
    throw new Error('Valid review outcome is required (UPHOLD_DISPUTE or REJECT_DISPUTE)')
  }

  const remarks = (decisionData.remarks || decisionData.reason || '').trim()
  if (!remarks) {
    throw new Error('Documented decision remarks are required')
  }

  const complaintRef = doc(customDb, 'issues', complaintId)

  return runTransaction(customDb, async transaction => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint does not exist')
    }
    const complaint = snap.data()

    if (complaint.status !== 'Disputed') {
      throw new Error(`Complaint is not in Disputed status (current: ${complaint.status})`)
    }

    const nextStatus = outcome === 'UPHOLD_DISPUTE' ? 'In Progress' : 'Resolved'

    const reviewRecord = {
      outcome,
      remarks,
      reviewedBy: adminActor.uid,
      reviewedAt: serverTimestamp(),
    }

    const updates = {
      status: nextStatus,
      disputeReview: reviewRecord,
      updatedAt: serverTimestamp(),
    }

    if (nextStatus === 'Resolved') {
      updates.resolvedAt = serverTimestamp()
    }

    transaction.update(complaintRef, updates)

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: adminActor.uid,
        action: 'Dispute reviewed',
        previousStatus: 'Disputed',
        newStatus: nextStatus,
        remarks: `[Admin Review: ${outcome}] ${remarks}`,
      })
    )

    // Notify citizen of dispute outcome
    if (complaint.reportedBy) {
      const message =
        outcome === 'UPHOLD_DISPUTE'
          ? `Your dispute was upheld by administration. The complaint has been returned to In Progress for corrective work: ${remarks}`
          : `Your dispute was reviewed and the resolution upheld by administration: ${remarks}`

      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminActor.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: `Dispute Review: ${outcome === 'UPHOLD_DISPUTE' ? 'Upheld' : 'Concluded'}`,
        message,
        createdAt: serverTimestamp(),
      }, customDb)
    }

    return { success: true, status: nextStatus, outcome }
  })
}

/**
 * Trusted server-side automatic verification process.
 * Can be executed by scheduled backend Cloud Functions or administrative sweep.
 *
 * Verifies:
 * - Status is still 'Pending Verification'
 * - Verification deadline has elapsed (trusted time)
 * - Transitions atomically to 'Resolved'
 * - Records 'Resolution auto-verified' audit event
 */
export async function autoVerifyExpiredComplaint(
  complaintId,
  currentTimeMs = Date.now(),
  customDb = db
) {
  if (!complaintId) throw new Error('Complaint ID is required')

  const complaintRef = doc(customDb, 'issues', complaintId)

  return runTransaction(customDb, async transaction => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint does not exist')
    }
    const complaint = snap.data()

    // Must still be Pending Verification
    if (complaint.status !== 'Pending Verification') {
      return { skipped: true, reason: `Status is ${complaint.status}` }
    }

    const deadline = complaint.verificationDeadline
    const deadlineMs = deadline?.toMillis ? deadline.toMillis() : (deadline?.seconds ? deadline.seconds * 1000 : null)

    if (!deadlineMs) {
      throw new Error('Missing verification deadline timestamp')
    }

    if (currentTimeMs < deadlineMs) {
      return { skipped: true, reason: 'Verification deadline has not expired yet' }
    }

    const updates = {
      status: 'Resolved',
      autoVerified: true,
      autoVerifiedAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    transaction.update(complaintRef, updates)

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: 'system:auto-verifier',
        action: 'Resolution auto-verified',
        previousStatus: 'Pending Verification',
        newStatus: 'Resolved',
        remarks: 'Automatically resolved after 5-day citizen review window elapsed without dispute',
      })
    )

    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: 'system',
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Complaint Automatically Resolved',
        message: 'Your complaint was automatically marked resolved as the 5-day verification period concluded without dispute.',
        createdAt: serverTimestamp(),
      }, customDb)
    }

    return { success: true, status: 'Resolved', autoVerified: true }
  })
}
