import { doc, collection, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './services'
import { addNotificationToBatch } from './notifications'
import { buildComplaintEvent } from './complaintEvents'
import { getDisplayId } from './complaintId'

export async function mergeComplaints({
  childId,
  parentId,
  actorUid = null,
  expectedChildStatus = null,
}) {
  if (!childId || !parentId) {
    throw new Error('Both childId and parentId are required for merging')
  }

  if (childId === parentId) {
    throw new Error('Cannot merge a complaint into itself')
  }

  const childRef = doc(db, 'issues', childId)
  const parentRef = doc(db, 'issues', parentId)

  return runTransaction(db, async transaction => {
    const [childSnap, parentSnap] = await Promise.all([
      transaction.get(childRef),
      transaction.get(parentRef),
    ])

    if (!childSnap.exists()) {
      throw new Error('Child complaint no longer exists')
    }
    if (!parentSnap.exists()) {
      throw new Error('Parent complaint no longer exists')
    }

    const child = childSnap.data()
    const parent = parentSnap.data()

    if (expectedChildStatus && child.status !== expectedChildStatus) {
      throw new Error(`Child complaint status changed from ${expectedChildStatus} to ${child.status}`)
    }

    if (child.status === 'Merged - Duplicate') {
      throw new Error('Complaint is already merged')
    }

    if (parent.status === 'Merged - Duplicate') {
      throw new Error('Cannot merge into a complaint that is already marked as duplicate')
    }

    if (parent.status === 'Rejected') {
      throw new Error('Cannot merge into a rejected complaint')
    }

    // Circular merge detection: parent cannot be merged into child, and child cannot be an ancestor of parent
    if (
      parent.mergedInto === childId ||
      (child.complaintId && parent.mergedInto === child.complaintId) ||
      (Array.isArray(child.mergedChildIds) && (child.mergedChildIds.includes(parentId) || (parent.complaintId && child.mergedChildIds.includes(parent.complaintId))))
    ) {
      throw new Error('Circular merge detected')
    }

    const parentDisplayId = getDisplayId(parent)
    const childDisplayId = getDisplayId(child)
    const parentComplaintId = parent.complaintId || parentId

    // 1. Update child complaint
    transaction.update(childRef, {
      status: 'Merged - Duplicate',
      mergedInto: parentComplaintId,
      mergedIntoId: parentId,
      mergedAt: serverTimestamp(),
      mergedBy: actorUid ?? null,
      updatedAt: serverTimestamp(),
    })

    // 2. Consolidate endorsers onto parent ticket without duplicates
    const parentEndorsers = (Array.isArray(parent.endorsedBy) ? parent.endorsedBy : []).filter(Boolean)
    const childEndorsers = (Array.isArray(child.endorsedBy) ? child.endorsedBy : []).filter(Boolean)
    const consolidatedEndorsers = Array.from(new Set([...parentEndorsers, ...childEndorsers]))
    const endorsementCount = consolidatedEndorsers.length

    const existingChildIds = Array.isArray(parent.mergedChildIds) ? parent.mergedChildIds : []
    const childMergedIds = Array.isArray(child.mergedChildIds) ? child.mergedChildIds : []
    const mergedChildIds = Array.from(new Set([...existingChildIds, childId, ...childMergedIds]))

    const existingChildComplaintIds = Array.isArray(parent.mergedChildComplaintIds)
      ? parent.mergedChildComplaintIds
      : []
    const childCid = child.complaintId || childDisplayId
    const childMergedComplaintIds = Array.isArray(child.mergedChildComplaintIds)
      ? child.mergedChildComplaintIds
      : []
    const mergedChildComplaintIds = Array.from(
      new Set([...existingChildComplaintIds, childCid, ...childMergedComplaintIds])
    )

    // Consolidate reporters who filed merged duplicate tickets
    const existingReporters = Array.isArray(parent.mergedReporters) ? parent.mergedReporters : []
    const childReporters = Array.isArray(child.mergedReporters) ? child.mergedReporters : []
    const childAuthor = child.reportedBy ? [child.reportedBy] : []
    const mergedReporters = Array.from(
      new Set([...existingReporters, ...childAuthor, ...childReporters])
    ).filter(uid => uid && uid !== parent.reportedBy)

    transaction.update(parentRef, {
      mergedChildIds,
      mergedChildComplaintIds,
      mergedReporters,
      endorsedBy: consolidatedEndorsers,
      endorsementCount,
      updatedAt: serverTimestamp(),
    })

    // 3. Log audit event on child complaint
    const childEventRef = doc(collection(db, `issues/${childId}/events`))
    transaction.set(
      childEventRef,
      buildComplaintEvent({
        actorUid,
        action: 'Complaint merged',
        previousStatus: child.status,
        newStatus: 'Merged - Duplicate',
        remarks: `Merged into complaint ${parentComplaintId}`,
      })
    )

    // 4. Log audit event on parent complaint
    const parentEventRef = doc(collection(db, `issues/${parentId}/events`))
    transaction.set(
      parentEventRef,
      buildComplaintEvent({
        actorUid,
        action: 'Duplicate complaint consolidated',
        previousStatus: parent.status,
        newStatus: parent.status,
        remarks: `Consolidated duplicate complaint ${childDisplayId}`,
      })
    )

    // 5. Dispatch citizen notification to child ticket creator
    if (child.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: child.reportedBy,
        recipientRole: 'citizen',
        senderUid: actorUid || '',
        issueId: parentComplaintId,
        type: 'status_update',
        title: 'Complaint Merged',
        message: `Your complaint has been consolidated with ticket ${parentComplaintId} and will be tracked jointly.`,
      })
    }

    return {
      success: true,
      parentComplaintId,
      parentDisplayId,
      childComplaintId: childDisplayId,
    }
  })
}

