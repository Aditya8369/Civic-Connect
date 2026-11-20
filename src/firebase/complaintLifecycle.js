import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './services'
import { addNotificationToBatch } from './notifications'
import { buildComplaintEvent } from './complaintEvents'
import { evaluateCandidateOfficer, DEFAULT_MAX_CAPACITY } from './officerDispatch'

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
