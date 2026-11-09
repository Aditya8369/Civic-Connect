import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './services'
import { addComplaintEventToBatch } from './complaintEvents'
import { addNotificationToBatch } from './notifications'

export function assignComplaintDepartment(id, department, actorUid) {
  const session = auth.currentUser
  const ref = doc(db, 'issues', id)

  function assertCurrentSession() {
    if (!session || session.uid !== actorUid || auth.currentUser !== session) {
      throw new Error('Your sign-in session changed. Please sign in and try again.')
    }
  }

  return runTransaction(db, async transaction => {
    assertCurrentSession()
    const current = (await transaction.get(ref)).data()
    assertCurrentSession()
    if (!current) throw new Error('Complaint no longer exists')
    if (current.department === department) return false

    transaction.update(ref, { department, updatedAt: serverTimestamp() })
    addComplaintEventToBatch(transaction, id, {
      actorUid,
      action: 'Department assigned',
      previousStatus: current.status,
      newStatus: current.status,
      remarks: `Department assigned: ${department}`,
    })
    if (current.reportedBy) {
      addNotificationToBatch(transaction, {
        recipientUid: current.reportedBy,
        recipientRole: 'citizen',
        senderUid: actorUid,
        issueId: current.complaintId || id,
        type: 'department_assigned',
        title: 'Department Assigned',
        message: `Your complaint has been assigned to the ${department} department.`,
      })
    }
    return true
  })
}
