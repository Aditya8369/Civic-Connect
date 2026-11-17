// Load firestore.rules in a local emulator for demo-civic-notifications, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getFirestore,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-notifications'
const citizenAUid = `citizen-a-${randomUUID()}`
const citizenBUid = `citizen-b-${randomUUID()}`
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

const citizenA = client('citizenA', citizenAUid, 'citizen')
const citizenB = client('citizenB', citizenBUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signedOut')
after(() => Promise.all(apps.map(deleteApp)))

const notifDoc = (db, id) => doc(db, 'notifications', id)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

test('citizen can read their own notification', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Status Updated',
    message: 'Your complaint is In Progress.',
    read: false,
    createdAt: serverTimestamp(),
  })

  const snap = await getDoc(notifDoc(citizenA, id))
  assert.equal(snap.exists(), true)
  assert.equal(snap.data().recipientUid, citizenAUid)
})

test('citizen cannot read another citizen notification', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Status Updated',
    message: 'Private citizen update.',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(getDoc(notifDoc(citizenB, id)))
})

test('signed-out user cannot read notifications', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Status Updated',
    message: 'Private update.',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(getDoc(notifDoc(signedOut, id)))
})

test('admin can read broadcast admin notification, citizen cannot', async () => {
  const id = `notif-admin-${randomUUID()}`
  await setDoc(notifDoc(citizenA, id), {
    recipientUid: null,
    recipientRole: 'admin',
    senderUid: citizenAUid,
    issueId: 'CMP-2026-0001',
    type: 'new_complaint',
    title: 'New Complaint Submitted',
    message: 'A citizen has submitted a new complaint.',
    read: false,
    createdAt: serverTimestamp(),
  })

  const adminSnap = await getDoc(notifDoc(admin, id))
  assert.equal(adminSnap.exists(), true)
  await denied(getDoc(notifDoc(citizenB, id)))
})

test('recipient citizen can update read status on their own notification', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Status Updated',
    message: 'Check your status.',
    read: false,
    createdAt: serverTimestamp(),
  })

  await updateDoc(notifDoc(citizenA, id), { read: true })
  const snap = await getDoc(notifDoc(citizenA, id))
  assert.equal(snap.data().read, true)
})

test('other citizen cannot update read status on another citizen notification', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Status Updated',
    message: 'Read status tampering attempt.',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(updateDoc(notifDoc(citizenB, id), { read: true }))
})

test('updating fields other than read is denied', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Original Title',
    message: 'Original Message',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(updateDoc(notifDoc(citizenA, id), { title: 'Hacked Title' }))
  await denied(updateDoc(notifDoc(citizenA, id), { read: true, message: 'Tampered' }))
})

test('updating read to non-boolean value is denied', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Original Title',
    message: 'Original Message',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(updateDoc(notifDoc(citizenA, id), { read: 'true' }))
  await denied(updateDoc(notifDoc(citizenA, id), { read: 1 }))
})

test('citizen can create valid admin desk notification', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(citizenA, id), {
    recipientUid: null,
    recipientRole: 'admin',
    senderUid: citizenAUid,
    issueId: 'CMP-2026-0001',
    type: 'new_complaint',
    title: 'Pothole Reported',
    message: 'Please triage this pothole.',
    read: false,
    createdAt: serverTimestamp(),
  })
})

test('citizen cannot spoof senderUid during creation', async () => {
  const id = `notif-${randomUUID()}`
  await denied(setDoc(notifDoc(citizenA, id), {
    recipientUid: null,
    recipientRole: 'admin',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'new_complaint',
    title: 'Spoofed Sender',
    message: 'Forged alert.',
    read: false,
    createdAt: serverTimestamp(),
  }))
})

test('citizen cannot create direct notification targeted to another citizen', async () => {
  const id = `notif-${randomUUID()}`
  await denied(setDoc(notifDoc(citizenA, id), {
    recipientUid: citizenBUid,
    recipientRole: 'citizen',
    senderUid: citizenAUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Direct Message Attempt',
    message: 'Should be denied.',
    read: false,
    createdAt: serverTimestamp(),
  }))
})

test('admin can create direct notification to citizen', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'department_assigned',
    title: 'Department Assigned',
    message: 'Your complaint has been assigned to Electricity.',
    read: false,
    createdAt: serverTimestamp(),
  })
})

test('admin cannot create direct citizen notification without recipientUid', async () => {
  const id = `notif-${randomUUID()}`
  await denied(setDoc(notifDoc(admin, id), {
    recipientUid: null,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Missing recipient',
    message: 'Should fail validation.',
    read: false,
    createdAt: serverTimestamp(),
  }))
})

test('deleting notifications is denied for both citizen and admin', async () => {
  const id = `notif-${randomUUID()}`
  await setDoc(notifDoc(admin, id), {
    recipientUid: citizenAUid,
    recipientRole: 'citizen',
    senderUid: adminUid,
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Permanent Alert',
    message: 'Cannot be deleted.',
    read: false,
    createdAt: serverTimestamp(),
  })

  await denied(deleteDoc(notifDoc(citizenA, id)))
  await denied(deleteDoc(notifDoc(admin, id)))
})
