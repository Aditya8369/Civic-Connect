import { doc, runTransaction, writeBatch, serverTimestamp } from 'firebase/firestore'
import { db } from './services'
import { addComplaintEventToBatch } from './complaintEvents'
import { addNotificationToBatch } from './notifications'

export const BATCH_CHUNK_SIZE = 150

/**
 * Normalizes an array or map of complaints into an id-indexed object
 */
export function normalizeComplaintsMap(complaints) {
  if (!complaints) return {}
  if (Array.isArray(complaints)) {
    return Object.fromEntries(complaints.map((c) => [c.id, c]))
  }
  return complaints
}

/**
 * Checks expected statuses and commits each chunk with its events and notices.
 * Results are accumulated only after a transaction finishes, including retries.
 */
export async function bulkUpdateComplaintsStatus({
  complaintIds = [],
  complaints = [],
  newStatus,
  actorUid = null,
  remarks = '',
  customDb = db,
}) {
  if (!complaintIds || complaintIds.length === 0) {
    return { success: true, count: 0 }
  }
  if (!newStatus) {
    throw new Error('New status is required for bulk status update')
  }

  const complaintMap = normalizeComplaintsMap(complaints)
  const ids = [...new Set(complaintIds)]
  const expectedStatuses = new Map(ids.map(id => [id, complaintMap[id]?.status]))
  const result = { success: true, count: 0, conflictIds: [], failedIds: [], unchangedIds: [] }

  for (let i = 0; i < ids.length; i += BATCH_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + BATCH_CHUNK_SIZE)
    try {
      const committed = await runTransaction(customDb, async transaction => {
        const refs = chunk.map(id => doc(customDb, 'issues', id))
        // Firestore requires every read to precede the first staged write.
        const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
        const updatedIds = []
        const conflictIds = []
        const unchangedIds = []

        for (const [index, id] of chunk.entries()) {
          const complaint = snapshots[index].data()
          const expectedStatus = expectedStatuses.get(id)
          if (!complaint || !expectedStatus || complaint.status !== expectedStatus) {
            conflictIds.push(id)
            continue
          }
          if (complaint.status === newStatus) {
            unchangedIds.push(id)
            continue
          }

          const updateData = { status: newStatus, updatedAt: serverTimestamp() }
          if (newStatus === 'Resolved') updateData.resolvedAt = serverTimestamp()
          transaction.update(refs[index], updateData)
          addComplaintEventToBatch(transaction, id, {
            actorUid,
            action: 'Status changed',
            previousStatus: complaint.status,
            newStatus,
            remarks: remarks || `Bulk status update to ${newStatus}`,
          }, customDb)
          if (complaint.reportedBy) {
            addNotificationToBatch(transaction, {
              recipientUid: complaint.reportedBy,
              recipientRole: 'citizen',
              senderUid: actorUid,
              issueId: complaint.complaintId || id,
              type: 'status_update',
              title: 'Complaint Status Updated',
              message: `Your complaint status has been updated to "${newStatus}".`,
            }, customDb)
          }
          updatedIds.push(id)
        }
        return { updatedIds, conflictIds, unchangedIds }
      })
      result.count += committed.updatedIds.length
      result.conflictIds.push(...committed.conflictIds)
      result.unchangedIds.push(...committed.unchangedIds)
    } catch (error) {
      console.error('Bulk status transaction failed:', error)
      result.failedIds.push(...chunk)
    }
  }

  result.success = result.conflictIds.length === 0 && result.failedIds.length === 0
  return result
}

/**
 * Bulk reassigns the department of multiple complaints atomically with audit events
 */
export async function bulkAssignComplaintsDepartment({
  complaintIds = [],
  complaints = [],
  newDepartment,
  actorUid = null,
  remarks = '',
  customDb = db,
}) {
  if (!complaintIds || complaintIds.length === 0) {
    return { success: true, count: 0 }
  }
  if (!newDepartment) {
    throw new Error('New department is required for bulk department reassignment')
  }

  const complaintMap = normalizeComplaintsMap(complaints)

  const chunks = []
  for (let i = 0; i < complaintIds.length; i += BATCH_CHUNK_SIZE) {
    chunks.push(complaintIds.slice(i, i + BATCH_CHUNK_SIZE))
  }

  for (const chunk of chunks) {
    const batch = writeBatch(customDb)

    for (const id of chunk) {
      const complaint = complaintMap[id] || {}
      const ref = doc(customDb, 'issues', id)

      const updateData = {
        department: newDepartment,
        updatedAt: serverTimestamp(),
      }
      batch.update(ref, updateData)

      // Atomic audit event creation in sub-collection issues/{id}/events
      addComplaintEventToBatch(
        batch,
        id,
        {
          actorUid,
          action: 'Department assigned',
          previousStatus: complaint.status || null,
          newStatus: complaint.status || null,
          remarks: remarks || `Bulk department reassignment to ${newDepartment}`,
        },
        customDb
      )

      // Citizen in-app notification
      if (complaint.reportedBy) {
        addNotificationToBatch(
          batch,
          {
            recipientUid: complaint.reportedBy,
            recipientRole: 'citizen',
            senderUid: actorUid,
            issueId: complaint.complaintId || id,
            type: 'department_assigned',
            title: 'Department Assigned',
            message: `Your complaint has been assigned to the ${newDepartment} department.`,
          },
          customDb
        )
      }
    }

    await batch.commit()
  }

  return { success: true, count: complaintIds.length }
}

/**
 * Generic dispatcher for bulk complaint actions
 */
export async function executeBulkComplaintAction({
  actionType,
  value,
  complaintIds = [],
  complaints = [],
  actorUid = null,
  remarks = '',
  customDb = db,
}) {
  if (actionType === 'status') {
    return bulkUpdateComplaintsStatus({
      complaintIds,
      complaints,
      newStatus: value,
      actorUid,
      remarks,
      customDb,
    })
  }

  if (actionType === 'department') {
    return bulkAssignComplaintsDepartment({
      complaintIds,
      complaints,
      newDepartment: value,
      actorUid,
      remarks,
      customDb,
    })
  }

  throw new Error(`Unsupported bulk action type: "${actionType}"`)
}

