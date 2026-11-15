import { collection, addDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from './services'

export function sortEvents(list) {
  if (!Array.isArray(list)) return []
  const getMillis = (val) => {
    if (!val) return 0
    if (typeof val.toMillis === 'function') return val.toMillis()
    if (typeof val.toDate === 'function') {
      const d = val.toDate()
      return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : 0
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime()
    if (typeof val.seconds === 'number') return val.seconds * 1000
    if (typeof val === 'number') return isNaN(val) ? 0 : val
    const parsed = new Date(val).getTime()
    return isNaN(parsed) ? 0 : parsed
  }
  return [...list].sort((a, b) => getMillis(a?.timestamp) - getMillis(b?.timestamp))
}

export function formatEventDate(ts) {
  if (!ts) return ''
  let date = null
  if (typeof ts?.toDate === 'function') {
    date = ts.toDate()
  } else if (ts instanceof Date) {
    date = ts
  } else if (typeof ts?.seconds === 'number') {
    date = new Date(ts.seconds * 1000)
  } else if (typeof ts === 'number' || typeof ts === 'string') {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) date = d
  }
  if (!date || isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function buildComplaintEvent({
  timestamp = null,
  actorUid = null,
  action,
  previousStatus = null,
  newStatus = null,
  remarks = '',
}) {
  return {
    timestamp: timestamp || serverTimestamp(),
    actorUid: actorUid ?? null,
    action,
    previousStatus: previousStatus ?? null,
    newStatus: newStatus ?? null,
    remarks: remarks || '',
  }
}

export async function logComplaintEvent(issueId, eventFields) {
  const eventData = buildComplaintEvent(eventFields)
  return await addDoc(collection(db, `issues/${issueId}/events`), eventData)
}

export function addComplaintEventToBatch(batch, issueId, eventFields, customDb = db) {
  const eventRef = doc(collection(customDb, `issues/${issueId}/events`))
  const eventData = buildComplaintEvent(eventFields)
  batch.set(eventRef, eventData)
  return eventRef
}

