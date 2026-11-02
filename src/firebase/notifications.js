import { collection, addDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './services'

function buildNotification({
  recipientUid = null,
  recipientRole,
  senderUid,
  issueId,
  type,
  title,
  message,
}) {
  return {
    recipientUid,
    recipientRole,
    senderUid,
    issueId,
    type,
    title,
    message,
    read: false,
    createdAt: serverTimestamp(),
  }
}

export async function createNotification(fields) {
  await addDoc(collection(db, 'notifications'), buildNotification(fields))
}

// Queues the notification on an existing writeBatch so it commits atomically with the caller's other writes.
export function addNotificationToBatch(batch, fields) {
  batch.set(doc(collection(db, 'notifications')), buildNotification(fields))
}
