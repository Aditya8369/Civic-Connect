// Load firestore.rules in a local emulator for demo-civic-events, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore,
  runTransaction, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-events'
const authorUid = `author-${randomUUID()}`
const otherUid = `other-${randomUUID()}`
const adminUid = `admin-${randomUUID()}`
const apps = []

function client(name, uid, role) {
  const app = initializeApp({ projectId }, name)
  apps.push(app)
  const db = getFirestore(app)
  const options = uid ? { mockUserToken: { sub: uid, role } } : undefined
  connectFirestoreEmulator(db, endpoint[1], Number(endpoint[2]), options)
  return db
}

const author = client('author', authorUid, 'citizen')
const other = client('other', otherUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signedOut')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const eventsCol = (db, issueId) => collection(db, 'issues', issueId, 'events')
const eventDoc = (db, issueId, eventId) => doc(db, 'issues', issueId, 'events', eventId)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

async function seedIssue() {
  const id = `event-issue-${randomUUID()}`
  await setDoc(issue(author, id), {
    title: 'Pothole on Main Street',
    description: 'Deep pothole near the intersection',
    category: 'Roads',
    status: 'Pending',
    reportedBy: authorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return id
}

test('complaint author can append "Complaint submitted" event to their complaint', async () => {
  const id = await seedIssue()
  const ref = await addDoc(eventsCol(author, id), {
    actorUid: authorUid,
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Complaint reported by citizen',
    timestamp: serverTimestamp(),
  })
  assert(ref.id)
  const snap = await getDoc(eventDoc(author, id, ref.id))
  assert.equal(snap.exists(), true)
  assert.equal(snap.data().action, 'Complaint submitted')
  assert.equal(snap.data().actorUid, authorUid)
})

test('complaint author can append "Status changed" with "Reopened" status', async () => {
  const id = await seedIssue()
  await updateDoc(issue(admin, id), {
    status: 'Resolved',
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  // The appeal and its audit event must commit atomically, exactly as the
  // application's reopen workflow does.
  const ref = await runTransaction(author, async transaction => {
    const ref = issue(author, id)
    const snap = await transaction.get(ref)
    assert.equal(snap.data().status, 'Resolved')
    transaction.update(ref, {
      status: 'Reopened',
      reopenReason: 'Issue recurred',
      reopenedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    const eventRef = doc(collection(ref, 'events'))
    transaction.set(eventRef, {
      actorUid: authorUid,
      action: 'Status changed',
      previousStatus: 'Resolved',
      newStatus: 'Reopened',
      remarks: 'Issue recurred',
      timestamp: serverTimestamp(),
    })
    return eventRef
  })
  assert(ref.id)
})

test('unauthorized citizen CANNOT append events to another citizen\'s complaint', async () => {
  const id = await seedIssue()
  await denied(addDoc(eventsCol(other, id), {
    actorUid: otherUid,
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Trying to inject event',
    timestamp: serverTimestamp(),
  }))
})

test('citizen CANNOT forge actorUid impersonating an admin or other user', async () => {
  const id = await seedIssue()
  await denied(addDoc(eventsCol(author, id), {
    actorUid: adminUid,
    action: 'Status changed',
    previousStatus: 'Pending',
    newStatus: 'Resolved',
    remarks: 'Forged resolution',
    timestamp: serverTimestamp(),
  }))
})

test('citizen CANNOT append admin-only actions (Department assigned, Field worker designated)', async () => {
  const id = await seedIssue()
  await denied(addDoc(eventsCol(author, id), {
    actorUid: authorUid,
    action: 'Department assigned',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Citizen trying to assign department',
    timestamp: serverTimestamp(),
  }))

  await denied(addDoc(eventsCol(author, id), {
    actorUid: authorUid,
    action: 'Field worker designated',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Citizen trying to assign field worker',
    timestamp: serverTimestamp(),
  }))
})

test('admin can log administrative events on any complaint', async () => {
  const id = await seedIssue()

  const deptRef = await addDoc(eventsCol(admin, id), {
    actorUid: adminUid,
    action: 'Department assigned',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Assigned to Public Works',
    timestamp: serverTimestamp(),
  })
  assert(deptRef.id)

  const workerRef = await addDoc(eventsCol(admin, id), {
    actorUid: adminUid,
    action: 'Field worker designated',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Assigned to Officer John (+919876543210)',
    timestamp: serverTimestamp(),
  })
  assert(workerRef.id)

  const statusRef = await addDoc(eventsCol(admin, id), {
    actorUid: adminUid,
    action: 'Status changed',
    previousStatus: 'Pending',
    newStatus: 'Resolved',
    remarks: 'Issue resolved by field team',
    timestamp: serverTimestamp(),
  })
  assert(statusRef.id)
})

test('event documents are strictly immutable (cannot update or delete)', async () => {
  const id = await seedIssue()
  const ref = await addDoc(eventsCol(author, id), {
    actorUid: authorUid,
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Original audit trail',
    timestamp: serverTimestamp(),
  })

  // Deny update by author
  await denied(updateDoc(eventDoc(author, id, ref.id), {
    remarks: 'Tampered remarks',
  }))

  // Deny update by admin
  await denied(updateDoc(eventDoc(admin, id, ref.id), {
    remarks: 'Admin tampered remarks',
  }))

  // Deny delete by author
  await denied(deleteDoc(eventDoc(author, id, ref.id)))

  // Deny delete by admin
  await denied(deleteDoc(eventDoc(admin, id, ref.id)))
})

test('unauthenticated requests cannot read or write events', async () => {
  const id = await seedIssue()
  await denied(getDocs(eventsCol(signedOut, id)))
  await denied(addDoc(eventsCol(signedOut, id), {
    actorUid: 'anonymous',
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Anon write',
    timestamp: serverTimestamp(),
  }))
})
