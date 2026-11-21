import { doc, collection, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './services'
import { addNotificationToBatch } from './notifications'
import { buildComplaintEvent } from './complaintEvents'
import { evaluateCandidateOfficer, DEFAULT_MAX_CAPACITY } from './officerDispatch'
import {
  DEFAULT_SLA_POLICY,
  DEFAULT_SLA_POLICY_VERSION,
  getSlaPolicy,
  calculateBusinessDeadline,
  calculateEffectiveDeadlineWithPauses,
} from '../utils/businessCalendarSla'

const ACTIVE_STATUSES = Object.freeze(['Pending', 'In Progress', 'Reopened'])
const TERMINAL_STATUSES = Object.freeze(['Resolved', 'Rejected', 'Merged - Duplicate'])

/**
 * Commits a complaint status transition inside a Firestore transaction.
 *
 * Workload Counter Consistency:
 * - If transitioning from ACTIVE to TERMINAL: Atomically decrements the assigned officer's
 *   `activeComplaints` (and legacy `activeCount` alias) by 1 (clamped to >= 0).
 * - If transitioning from TERMINAL to ACTIVE (e.g. Reopening): Atomically increments the assigned officer's
 *   `activeComplaints` by 1 (if within maxCapacity).
 * - Reads all documents (issue, officer) before any writes to ensure Firestore transaction compliance.
 * - If no officer is assigned or officer document does not exist, complaint status transitions normally.
 */
export function commitComplaintTransition(
  id,
  expectedStatus,
  changes,
  notificationFor,
  canTransition = () => true,
  eventFor = null
) {
  const ref = doc(db, 'issues', id)
  return runTransaction(db, async (transaction) => {
    // 1. Transaction reads
    const snapshot = await transaction.get(ref)
    const complaint = snapshot.data()
    if (!complaint || complaint.status !== expectedStatus || !canTransition(complaint)) {
      throw new Error('Complaint is no longer eligible for this transition')
    }

    const nextStatus = changes.status || expectedStatus
    const wasActive = ACTIVE_STATUSES.includes(complaint.status)
    const isNowTerminal = TERMINAL_STATUSES.includes(nextStatus)
    const wasTerminal = TERMINAL_STATUSES.includes(complaint.status)
    const isNowActive = ACTIVE_STATUSES.includes(nextStatus)

    const assignedOfficerId = complaint.assignedOfficerId || complaint.assignedWorker?.officerId

    let officerRef = null
    let officerData = null

    // Determine if workload update is required
    const needsDecrement = wasActive && isNowTerminal && assignedOfficerId
    const needsIncrement = wasTerminal && isNowActive && assignedOfficerId

    if (needsDecrement || needsIncrement) {
      officerRef = doc(db, 'officers', assignedOfficerId)
      const officerSnap = await transaction.get(officerRef)
      if (officerSnap.exists()) {
        officerData = officerSnap.data()
      }
    }

    // 2. Transaction writes
    const notification = notificationFor(complaint)
    transaction.update(ref, changes)

    // Update officer workload atomically if applicable
    if (officerRef && officerData) {
      const currentActive = officerData.activeComplaints ?? officerData.activeCount ?? 0
      if (needsDecrement) {
        const newActive = Math.max(0, currentActive - 1)
        transaction.update(officerRef, {
          activeComplaints: newActive,
          activeCount: newActive,
        })
      } else if (needsIncrement) {
        const newActive = currentActive + 1
        transaction.update(officerRef, {
          activeComplaints: newActive,
          activeCount: newActive,
        })
      }
    }

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
 * Concurrency-safe transactional dispatch of a complaint to a field officer.
 *
 * Verifies:
 * - Admin authorization
 * - Complaint existence and dispatch eligibility (e.g. Pending, In Progress, Reopened)
 * - Officer existence, active availability, and capacity limit
 * - Atomic decrement/increment of previous officer workload upon reassignment
 * - Atomic update of complaint assignment, status to 'In Progress', dispatch metadata
 * - Appending immutable audit event of type 'OFFICER_DISPATCHED' (with fallback action 'Field worker designated')
 *
 * @param {string} complaintId - Document ID in `issues`
 * @param {string} officerId - Document ID in `officers`
 * @param {Object} adminUser - Authenticated admin user object { uid, role, name, email }
 * @param {Object} [options] - Additional dispatch options (customWeights, customDb, remarks)
 * @returns {Promise<Object>} Committed dispatch result
 */
export async function dispatchComplaintToOfficer(
  complaintId,
  officerId,
  adminUser,
  options = {}
) {
  if (!complaintId || typeof complaintId !== 'string') {
    throw new Error('Valid complaint ID is required')
  }
  if (!officerId || typeof officerId !== 'string') {
    throw new Error('Valid officer ID is required')
  }
  if (!adminUser || !adminUser.uid) {
    throw new Error('Authentication required for officer dispatch')
  }
  if (adminUser.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may dispatch complaints')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)
  const officerRef = doc(firestoreDb, 'officers', officerId)

  return runTransaction(firestoreDb, async (transaction) => {
    // 1. Transaction reads
    const complaintSnap = await transaction.get(complaintRef)
    if (!complaintSnap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = complaintSnap.data()

    // Status validation: Complaints can be dispatched if they are Pending, In Progress, or Reopened
    const dispatchableStatuses = ['Pending', 'In Progress', 'Reopened']
    if (!dispatchableStatuses.includes(complaint.status)) {
      throw new Error(`Complaint with status "${complaint.status}" cannot be dispatched`)
    }

    const officerSnap = await transaction.get(officerRef)
    if (!officerSnap.exists()) {
      throw new Error('Selected officer document does not exist')
    }
    const officer = officerSnap.data()

    // Inactive check
    if (officer.active === false) {
      throw new Error(`Officer ${officer.name || officerId} is currently inactive`)
    }

    // Capacity check
    const currentActive = officer.activeComplaints ?? officer.activeCount ?? 0
    const maxCapacity = officer.maxCapacity ?? officer.capacity ?? DEFAULT_MAX_CAPACITY

    // If reassigning to the exact same officer who already owns this complaint, don't double count
    const previousWorker = complaint.assignedWorker || {}
    const isSameOfficer =
      complaint.assignedOfficerId === officerId ||
      previousWorker.officerId === officerId

    if (!isSameOfficer && currentActive >= maxCapacity) {
      throw new Error(`Officer ${officer.name || officerId} has reached maximum capacity (${currentActive}/${maxCapacity})`)
    }

    // If reassignment from a different officer, check if previous officer needs workload decrement
    let previousOfficerRef = null
    let previousOfficerData = null
    const prevOfficerId = complaint.assignedOfficerId || previousWorker.officerId

    if (prevOfficerId && prevOfficerId !== officerId) {
      previousOfficerRef = doc(firestoreDb, 'officers', prevOfficerId)
      const prevSnap = await transaction.get(previousOfficerRef)
      if (prevSnap.exists()) {
        previousOfficerData = prevSnap.data()
      }
    }

    // 2. Calculations
    const candidateEvaluation = evaluateCandidateOfficer(
      { id: officerId, ...officer },
      complaint,
      options.weights
    )

    const dispatchTimestamp = serverTimestamp()

    // 3. Transaction writes
    // Update complaint document
    const updatedWorker = {
      officerId,
      name: officer.name || 'Field Officer',
      phone: officer.phone || '',
      department: officer.department || complaint.department || '',
      assignedAt: dispatchTimestamp,
      dispatchedBy: adminUser.uid,
    }

    const complaintUpdates = {
      assignedWorker: updatedWorker,
      assignedOfficerId: officerId,
      status: 'In Progress',
      updatedAt: dispatchTimestamp,
      dispatchScore: candidateEvaluation.score,
      dispatchBreakdown: candidateEvaluation.breakdown,
    }

    transaction.update(complaintRef, complaintUpdates)

    // Update target officer workload atomically
    if (!isSameOfficer) {
      transaction.update(officerRef, {
        activeComplaints: currentActive + 1,
        activeCount: currentActive + 1,
        lastAssignedAt: dispatchTimestamp,
      })
    }

    // Decrement previous officer workload atomically if reassigned
    if (previousOfficerRef && previousOfficerData) {
      const prevActive = previousOfficerData.activeComplaints ?? previousOfficerData.activeCount ?? 1
      const newActive = Math.max(0, prevActive - 1)
      transaction.update(previousOfficerRef, {
        activeComplaints: newActive,
        activeCount: newActive,
      })
    }

    // Append audit event
    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    const remarks =
      options.remarks ||
      `Dispatched to officer ${officer.name || officerId} (Score: ${candidateEvaluation.score}/100)`

    const auditEventData = buildComplaintEvent({
      actorUid: adminUser.uid,
      action: 'Field worker designated', // Established schema compatible with firestore.rules
      previousStatus: complaint.status,
      newStatus: 'In Progress',
      remarks,
    })

    // Add extended dispatch metadata
    auditEventData.eventType = 'OFFICER_DISPATCHED'
    auditEventData.officerId = officerId
    auditEventData.officerName = officer.name || 'Field Officer'
    auditEventData.dispatchScore = candidateEvaluation.score
    auditEventData.dispatchBreakdown = candidateEvaluation.breakdown

    transaction.set(eventRef, auditEventData)

    // Add citizen notification if reporter exists
    if (complaint.reportedBy) {
      const notification = {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminUser.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Officer Dispatched',
        message: `Officer ${officer.name || 'Field Officer'} has been dispatched for your complaint.`,
        read: false,
        createdAt: dispatchTimestamp,
      }
      addNotificationToBatch(transaction, notification)
    }

    return {
      success: true,
      complaintId,
      officerId,
      assignedWorker: updatedWorker,
      score: candidateEvaluation.score,
      breakdown: candidateEvaluation.breakdown,
    }
  })
}
export const DISPUTE_REASONS = Object.freeze([
  'WORK_INCOMPLETE',
  'INCORRECT_LOCATION',
  'POOR_QUALITY',
  'OTHER',
])

const VERIFICATION_WINDOW_MS = 5 * 24 * 60 * 60 * 1000

function decrementOfficerWorkloadIfNeeded(transaction, officerRef, officerData) {
  if (!officerRef || !officerData) return
  const currentActive = officerData.activeComplaints ?? officerData.activeCount ?? 0
  const newActive = Math.max(0, currentActive - 1)
  transaction.update(officerRef, {
    activeComplaints: newActive,
    activeCount: newActive,
  })
}

export async function submitResolutionForVerification(
  complaintId,
  { resolutionNotes, resolutionProof } = {},
  adminUser,
  options = {}
) {
  if (!adminUser?.uid || adminUser.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may submit resolution proof')
  }

  const notes = typeof resolutionNotes === 'string' ? resolutionNotes.trim() : ''
  if (!notes) {
    throw new Error('Resolution completion notes are required')
  }

  if (
    !resolutionProof?.downloadUrl ||
    typeof resolutionProof.path !== 'string' ||
    !resolutionProof.path.startsWith('complaint-resolution-proof/')
  ) {
    throw new Error('Valid resolution proof under complaint-resolution-proof/ is required')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    const eligibleStatuses = ['Pending', 'In Progress', 'Reopened']
    if (!eligibleStatuses.includes(complaint.status)) {
      throw new Error(`Complaint with status "${complaint.status}" cannot be submitted for verification`)
    }

    const now = serverTimestamp()
    const verificationDeadline = Timestamp.fromMillis(Date.now() + VERIFICATION_WINDOW_MS)
    const normalizedProof = {
      ...resolutionProof,
      uploadedBy: adminUser.uid,
      uploadedAt: now,
    }

    transaction.update(complaintRef, {
      status: 'Pending Verification',
      resolutionNotes: notes,
      resolutionProof: normalizedProof,
      resolutionPhotos: [resolutionProof.downloadUrl],
      verificationDeadline,
      submittedForVerificationBy: adminUser.uid,
      submittedForVerificationAt: now,
      updatedAt: now,
    })

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: adminUser.uid,
        action: 'Submitted for verification',
        previousStatus: complaint.status,
        newStatus: 'Pending Verification',
        remarks: notes,
      })
    )

    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminUser.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Resolution Ready for Verification',
        message: 'Work is marked complete. Please review and verify within 5 days.',
        read: false,
        createdAt: now,
      })
    }

    return {
      success: true,
      status: 'Pending Verification',
      resolutionProof: normalizedProof,
      verificationDeadline,
    }
  })
}

export async function acceptComplaintResolution(
  complaintId,
  citizenUser,
  feedback = {},
  options = {}
) {
  if (!citizenUser?.uid) {
    throw new Error('Authentication required to accept resolution')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    if (complaint.reportedBy !== citizenUser.uid) {
      throw new Error('Only the citizen who reported this complaint may accept the resolution')
    }

    if (complaint.status !== 'Pending Verification') {
      throw new Error('Complaint is not pending verification')
    }

    const deadlineMs =
      complaint.verificationDeadline?.toMillis?.() ??
      complaint.verificationDeadline?.toDate?.()?.getTime?.()
    if (deadlineMs && deadlineMs <= Date.now()) {
      throw new Error('The 5-day review period for this resolution has expired')
    }

    const assignedOfficerId = complaint.assignedOfficerId || complaint.assignedWorker?.officerId
    let officerRef = null
    let officerData = null
    if (assignedOfficerId) {
      officerRef = doc(firestoreDb, 'officers', assignedOfficerId)
      const officerSnap = await transaction.get(officerRef)
      if (officerSnap.exists()) {
        officerData = officerSnap.data()
      }
    }

    const now = serverTimestamp()
    const rating =
      typeof feedback.rating === 'number' && feedback.rating >= 1 && feedback.rating <= 5
        ? feedback.rating
        : null
    const comment = typeof feedback.comment === 'string' ? feedback.comment.trim() : ''

    const updates = {
      status: 'Resolved',
      acceptedBy: citizenUser.uid,
      acceptedAt: now,
      resolvedAt: now,
      updatedAt: now,
    }

    if (rating !== null || comment) {
      updates.resolutionFeedback = {
        ...(rating !== null ? { rating } : {}),
        ...(comment ? { comment } : {}),
        submittedBy: citizenUser.uid,
        submittedAt: now,
      }
    }

    transaction.update(complaintRef, updates)
    decrementOfficerWorkloadIfNeeded(transaction, officerRef, officerData)

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: citizenUser.uid,
        action: 'Resolution accepted by citizen',
        previousStatus: 'Pending Verification',
        newStatus: 'Resolved',
        remarks: comment || 'Citizen verified and accepted resolution.',
      })
    )

    return {
      success: true,
      status: 'Resolved',
    }
  })
}

export async function disputeComplaintResolution(
  complaintId,
  { reason, explanation, evidence = [] } = {},
  citizenUser,
  options = {}
) {
  if (!citizenUser?.uid) {
    throw new Error('Authentication required to dispute resolution')
  }

  if (!DISPUTE_REASONS.includes(reason)) {
    throw new Error('Please select a valid dispute reason category')
  }

  const trimmedExplanation = typeof explanation === 'string' ? explanation.trim() : ''
  if (!trimmedExplanation) {
    throw new Error('A detailed dispute explanation is required')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    if (complaint.reportedBy !== citizenUser.uid) {
      throw new Error('Only the citizen who reported this complaint may dispute the resolution')
    }

    if (complaint.status !== 'Pending Verification') {
      throw new Error('Complaint is not pending verification')
    }

    const deadlineMs =
      complaint.verificationDeadline?.toMillis?.() ??
      complaint.verificationDeadline?.toDate?.()?.getTime?.()
    if (deadlineMs && deadlineMs <= Date.now()) {
      throw new Error('The 5-day review period for this resolution has expired')
    }

    const now = serverTimestamp()
    const disputeRecord = {
      reason,
      explanation: trimmedExplanation,
      evidence: Array.isArray(evidence) ? evidence : [],
      disputedBy: citizenUser.uid,
      disputedAt: now,
    }

    transaction.update(complaintRef, {
      status: 'Disputed',
      dispute: disputeRecord,
      updatedAt: now,
    })

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: citizenUser.uid,
        action: 'Resolution disputed by citizen',
        previousStatus: 'Pending Verification',
        newStatus: 'Disputed',
        remarks: `${reason}: ${trimmedExplanation}`,
      })
    )

    return {
      success: true,
      status: 'Disputed',
      dispute: disputeRecord,
    }
  })
}

export async function reviewComplaintDispute(
  complaintId,
  { outcome, remarks } = {},
  adminUser,
  options = {}
) {
  if (!adminUser?.uid || adminUser.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may review disputes')
  }

  if (outcome !== 'UPHOLD_DISPUTE' && outcome !== 'REJECT_DISPUTE') {
    throw new Error('Invalid dispute review outcome')
  }

  const trimmedRemarks = typeof remarks === 'string' ? remarks.trim() : ''
  if (!trimmedRemarks) {
    throw new Error('Administrative review remarks are required')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    if (complaint.status !== 'Disputed') {
      throw new Error('Complaint is not currently in Disputed status')
    }

    const nextStatus = outcome === 'UPHOLD_DISPUTE' ? 'In Progress' : 'Resolved'
    const assignedOfficerId = complaint.assignedOfficerId || complaint.assignedWorker?.officerId
    let officerRef = null
    let officerData = null

    if (nextStatus === 'Resolved' && assignedOfficerId) {
      officerRef = doc(firestoreDb, 'officers', assignedOfficerId)
      const officerSnap = await transaction.get(officerRef)
      if (officerSnap.exists()) {
        officerData = officerSnap.data()
      }
    }

    const now = serverTimestamp()
    const disputeReview = {
      outcome,
      remarks: trimmedRemarks,
      reviewedBy: adminUser.uid,
      reviewedAt: now,
    }

    const updates = {
      status: nextStatus,
      disputeReview,
      updatedAt: now,
    }
    if (nextStatus === 'Resolved') {
      updates.resolvedAt = now
    }

    transaction.update(complaintRef, updates)
    if (nextStatus === 'Resolved') {
      decrementOfficerWorkloadIfNeeded(transaction, officerRef, officerData)
    }

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: adminUser.uid,
        action: outcome === 'UPHOLD_DISPUTE' ? 'Dispute upheld for rework' : 'Dispute overruled',
        previousStatus: 'Disputed',
        newStatus: nextStatus,
        remarks: trimmedRemarks,
      })
    )

    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminUser.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: outcome === 'UPHOLD_DISPUTE' ? 'Dispute Upheld — Rework Ordered' : 'Dispute Review Completed',
        message: trimmedRemarks,
        read: false,
        createdAt: now,
      })
    }

    return {
      success: true,
      status: nextStatus,
      disputeReview,
    }
  })
}

export async function autoVerifyExpiredComplaint(
  complaintId,
  nowMs = Date.now(),
  options = {}
) {
  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      return { skipped: true, reason: 'not_found' }
    }
    const complaint = snap.data()

    if (complaint.status !== 'Pending Verification') {
      return { skipped: true, reason: 'invalid_status' }
    }

    const deadlineMs =
      complaint.verificationDeadline?.toMillis?.() ??
      complaint.verificationDeadline?.toDate?.()?.getTime?.()
    if (!deadlineMs || deadlineMs > nowMs) {
      return { skipped: true, reason: 'not_expired' }
    }

    const assignedOfficerId = complaint.assignedOfficerId || complaint.assignedWorker?.officerId
    let officerRef = null
    let officerData = null
    if (assignedOfficerId) {
      officerRef = doc(firestoreDb, 'officers', assignedOfficerId)
      const officerSnap = await transaction.get(officerRef)
      if (officerSnap.exists()) {
        officerData = officerSnap.data()
      }
    }

    const now = serverTimestamp()
    transaction.update(complaintRef, {
      status: 'Resolved',
      autoVerified: true,
      autoVerifiedAt: now,
      resolvedAt: now,
      updatedAt: now,
    })

    decrementOfficerWorkloadIfNeeded(transaction, officerRef, officerData)

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: 'system',
        action: 'Auto-verified after 5-day window',
        previousStatus: 'Pending Verification',
        newStatus: 'Resolved',
        remarks: 'Automatically marked Resolved after 5-day citizen verification period expired.',
      })
    )

    return {
      autoVerified: true,
      status: 'Resolved',
    }
  })
}

/**
 * Pauses a complaint's SLA countdown with an audited transition (Issue #282).
 */
export async function pauseComplaintSla(
  complaintId,
  { reason, remarks, maxDurationHours } = {},
  adminUser,
  options = {}
) {
  if (!complaintId || typeof complaintId !== 'string') {
    throw new Error('Valid complaint ID is required')
  }
  if (!adminUser?.uid) {
    throw new Error('Authentication required to pause SLA clock')
  }
  if (adminUser.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may pause the SLA clock')
  }
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Administrative review'
  const cleanRemarks = typeof remarks === 'string' ? remarks.trim() : ''

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    const eligibleStatuses = ['Pending', 'In Progress', 'Reopened', 'Pending Verification', 'Disputed']
    if (!eligibleStatuses.includes(complaint.status)) {
      throw new Error(`Complaint in status "${complaint.status}" cannot have its SLA clock paused`)
    }

    if (complaint.slaPause?.isPaused === true) {
      throw new Error('SLA clock is already paused for this complaint')
    }

    const now = serverTimestamp()
    const policyVersion = complaint.slaPolicyVersion || DEFAULT_SLA_POLICY_VERSION
    const policy = getSlaPolicy(policyVersion)
    const effectiveMaxDuration =
      typeof maxDurationHours === 'number' && maxDurationHours > 0
        ? maxDurationHours
        : policy.maxPauseDurationHours || 72

    const pauseRecord = {
      isPaused: true,
      pausedAt: now,
      pausedBy: adminUser.uid,
      reason: cleanReason,
      remarks: cleanRemarks,
      maxDurationHours: effectiveMaxDuration,
    }

    transaction.update(complaintRef, {
      slaPause: pauseRecord,
      updatedAt: now,
    })

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: adminUser.uid,
        action: 'SLA paused',
        previousStatus: complaint.status,
        newStatus: complaint.status,
        remarks: `${cleanReason}${cleanRemarks ? `: ${cleanRemarks}` : ''}`,
      })
    )

    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminUser.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Complaint SLA Clock Paused',
        message: `SLA resolution countdown has been paused: ${cleanReason}.`,
        read: false,
        createdAt: now,
      })
    }

    return {
      success: true,
      complaintId,
      slaPause: pauseRecord,
    }
  })
}

/**
 * Resumes a paused complaint's SLA countdown and advances effective deadline (Issue #282).
 */
export async function resumeComplaintSla(
  complaintId,
  { remarks } = {},
  adminUser,
  options = {}
) {
  if (!complaintId || typeof complaintId !== 'string') {
    throw new Error('Valid complaint ID is required')
  }
  if (!adminUser?.uid) {
    throw new Error('Authentication required to resume SLA clock')
  }
  if (adminUser.role !== 'admin') {
    throw new Error('Only authorized municipal administrators may resume the SLA clock')
  }

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) {
      throw new Error('Complaint document does not exist')
    }
    const complaint = snap.data()

    if (!complaint.slaPause || complaint.slaPause.isPaused !== true) {
      throw new Error('SLA clock is not currently paused for this complaint')
    }

    const now = serverTimestamp()
    const nowMs = Date.now()
    const pausedAtMs =
      (complaint.slaPause.pausedAt?.toMillis?.() ??
        (typeof complaint.slaPause.pausedAt === 'number'
          ? complaint.slaPause.pausedAt
          : new Date(complaint.slaPause.pausedAt).getTime())) || nowMs

    const policyVersion = complaint.slaPolicyVersion || DEFAULT_SLA_POLICY_VERSION
    const policy = getSlaPolicy(policyVersion)
    const maxPauseMs =
      (complaint.slaPause.maxDurationHours || policy.maxPauseDurationHours || 72) * 3600000

    const rawDurationMs = Math.max(0, nowMs - pausedAtMs)
    const appliedDurationMs = Math.min(rawDurationMs, maxPauseMs)

    const closedPause = {
      pausedAt: complaint.slaPause.pausedAt,
      resumedAt: now,
      pausedBy: complaint.slaPause.pausedBy || adminUser.uid,
      resumedBy: adminUser.uid,
      reason: complaint.slaPause.reason || 'Administrative pause',
      remarks: typeof remarks === 'string' ? remarks.trim() : complaint.slaPause.remarks || '',
      rawDurationMs,
      appliedDurationMs,
    }

    const history = Array.isArray(complaint.slaPauseHistory) ? [...complaint.slaPauseHistory] : []
    history.push(closedPause)

    // Recompute effective deadline using business calendar
    const createdMs =
      (complaint.createdAt?.toMillis?.() ??
        (typeof complaint.createdAt === 'number'
          ? complaint.createdAt
          : new Date(complaint.createdAt).getTime())) || nowMs
    const targetHours =
      policy.departmentTargets?.[complaint.department] ||
      policy.departmentTargets?.[complaint.category] ||
      DEFAULT_SLA_POLICY.departmentTargets.Roads

    const baseDeadline = calculateBusinessDeadline(
      createdMs,
      targetHours,
      policy,
      complaint.department || ''
    )
    const effectiveResult = calculateEffectiveDeadlineWithPauses({
      baseDeadline,
      pauses: history,
      currentPause: null,
      now: nowMs,
      policy,
      department: complaint.department || '',
    })

    const updates = {
      slaPause: {
        isPaused: false,
        lastResumedAt: now,
        lastResumedBy: adminUser.uid,
      },
      slaPauseHistory: history,
      effectiveSlaDeadline: Timestamp.fromDate(effectiveResult.effectiveDeadline),
      updatedAt: now,
    }

    transaction.update(complaintRef, updates)

    const eventRef = doc(collection(firestoreDb, `issues/${complaintId}/events`))
    transaction.set(
      eventRef,
      buildComplaintEvent({
        actorUid: adminUser.uid,
        action: 'SLA resumed',
        previousStatus: complaint.status,
        newStatus: complaint.status,
        remarks:
          remarks ||
          `SLA clock resumed after ${Math.round((appliedDurationMs / 3600000) * 10) / 10}h pause.`,
      })
    )

    if (complaint.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: complaint.reportedBy,
        recipientRole: 'citizen',
        senderUid: adminUser.uid,
        issueId: complaint.complaintId || complaintId,
        type: 'status_update',
        title: 'Complaint SLA Clock Resumed',
        message: 'Investigation has resumed and the SLA countdown is active.',
        read: false,
        createdAt: now,
      })
    }

    return {
      success: true,
      complaintId,
      effectiveDeadline: effectiveResult.effectiveDeadline,
    }
  })
}

/**
 * Idempotently records an SLA escalation threshold breach per policy version (Issue #282).
 */
export async function recordSlaEscalation(
  complaintId,
  { thresholdKey, threshold, policyVersion } = {},
  adminUser = { uid: 'system', role: 'admin' },
  options = {}
) {
  if (!complaintId) throw new Error('complaintId is required')
  if (!thresholdKey) throw new Error('thresholdKey is required')

  const firestoreDb = options.customDb || db
  const complaintRef = doc(firestoreDb, 'issues', complaintId)

  return runTransaction(firestoreDb, async (transaction) => {
    const snap = await transaction.get(complaintRef)
    if (!snap.exists()) return { skipped: true, reason: 'not_found' }
    const complaint = snap.data()

    const existing = complaint.slaEscalations || {}
    // Idempotent: create at most one escalation per threshold and policy version
    if (existing[thresholdKey]?.policyVersion === policyVersion) {
      return { skipped: true, reason: 'already_escalated' }
    }

    const now = serverTimestamp()
    const escalationEntry = {
      threshold,
      policyVersion: policyVersion || DEFAULT_SLA_POLICY_VERSION,
      escalatedAt: now,
      recordedBy: adminUser?.uid || 'system',
    }

    transaction.update(complaintRef, {
      [`slaEscalations.${thresholdKey}`]: escalationEntry,
      updatedAt: now,
    })

    return {
      success: true,
      thresholdKey,
      escalation: escalationEntry,
    }
  })
}