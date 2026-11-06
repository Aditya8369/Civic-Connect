import { doc, collection, runTransaction } from 'firebase/firestore'
import { db } from './services'
import { addNotificationToBatch } from './notifications'
import { buildComplaintEvent } from './complaintEvents'

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
