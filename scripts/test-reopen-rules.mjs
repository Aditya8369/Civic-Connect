// Load firestore.rules in a local emulator for demo-civic-reopen, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, getFirestore,
  query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-reopen'
const ownerUid = `appeal-owner-${randomUUID()}`
const day = 24 * 60 * 60 * 1000
const apps = []

function client(name, uid, role) {
  const app = initializeApp({ projectId }, name)
  apps.push(app)
  const db = getFirestore(app)
  const options = uid ? { mockUserToken: { sub: uid, role } } : undefined
  connectFirestoreEmulator(db, endpoint[1], Number(endpoint[2]), options)
  return db
}

const owner = client('owner', ownerUid, 'citizen')
const other = client('other', `${ownerUid}-other`, 'citizen')
const admin = client('admin', `${ownerUid}-admin`, 'admin')
const signedOut = client('signed-out')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const ago = ms => Timestamp.fromMillis(Date.now() - ms)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

async function seed({ status = 'Resolved', resolvedAt = ago(60000) } = {}) {
  const id = `appeal-${randomUUID()}`
  await setDoc(issue(owner, id), { status: 'Pending', reportedBy: ownerUid, title: 'Broken lamp', department: 'Electricity' })
  if (status !== 'Pending') {
    await updateDoc(issue(admin, id), resolvedAt === null ? { status } : { status, resolvedAt })
  }
  return id
}

function appeal(overrides = {}) {
  return {
    status: 'Reopened', reopenReason: 'Lamp is still broken',
    reopenedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...overrides,
  }
}

function submitAppeal(id, patch = appeal()) {
  const ref = issue(owner, id)
  return runTransaction(owner, async transaction => {
    const snapshot = await transaction.get(ref)
    assert.equal(snapshot.data().status, 'Resolved')
    transaction.update(ref, patch)
    transaction.set(doc(collection(ref, 'events')), {
      actorUid: ownerUid, action: 'Status changed', previousStatus: 'Resolved', newStatus: 'Reopened',
      remarks: 'Lamp is still broken', timestamp: serverTimestamp(),
    })
    transaction.set(doc(collection(owner, 'notifications')), {
      recipientUid: null, recipientRole: 'admin', senderUid: ownerUid, issueId: id, type: 'status_update',
      title: 'Complaint Reopened', message: 'Lamp is still broken', read: false, createdAt: serverTimestamp(),
    })
  })
}

async function relatedCounts(id) {
  const events = await getDocs(collection(issue(admin, id), 'events'))
  const notices = await getDocs(query(collection(admin, 'notifications'),
    where('recipientUid', '==', null), where('recipientRole', '==', 'admin')))
  return { events: events.size, notices: notices.docs.filter(row => row.data().issueId === id).length }
}

test('owner can reopen shortly before the seven-day deadline with the event and notice', async () => {
  const id = await seed({ resolvedAt: ago(7 * day - 60000) })
  const original = (await getDoc(issue(admin, id))).data()
  await submitAppeal(id)
  const saved = (await getDoc(issue(admin, id))).data()
  assert.equal(saved.status, 'Reopened')
  assert.equal(saved.reopenReason, 'Lamp is still broken')
  assert(saved.reopenedAt.isEqual(saved.updatedAt))
  assert.deepEqual(saved, { ...original, status: saved.status, reopenReason: saved.reopenReason, reopenedAt: saved.reopenedAt, updatedAt: saved.updatedAt })
  assert.deepEqual(await relatedCounts(id), { events: 1, notices: 1 })
  await denied(updateDoc(issue(owner, id), appeal()))
})

test('a denied transaction cannot create an event or notice', async () => {
  const id = await seed()
  const original = (await getDoc(issue(admin, id))).data()
  await denied(submitAppeal(id, appeal({ department: 'Roads' })))
  assert.deepEqual((await getDoc(issue(admin, id))).data(), original)
  assert.deepEqual(await relatedCounts(id), { events: 0, notices: 0 })
})

test('another citizen and an unauthenticated client cannot appeal', async () => {
  const id = await seed()
  await denied(updateDoc(issue(other, id), appeal()))
  await denied(updateDoc(issue(signedOut, id), appeal()))
})

for (const [name, resolvedAt] of [
  ['expired', ago(7 * day + 60000)], ['missing', null], ['malformed', 'not a timestamp'], ['future', ago(-60000)],
]) {
  test(`an owner cannot appeal a complaint with a ${name} resolution time`, async () => {
    const id = await seed({ resolvedAt })
    await denied(updateDoc(issue(owner, id), appeal()))
  })
}

test('only Resolved complaints can be appealed', async () => {
  for (const status of ['Pending', 'Rejected', 'In Progress', 'Reopened']) {
    const id = await seed({ status })
    await denied(updateDoc(issue(owner, id), appeal()))
  }
})

test('appeals require nonblank text and both server timestamps', async () => {
  const id = await seed()
  for (const reopenReason of ['', ' \t\n\r\v\u00a0\u2003\ufeff', 42]) {
    await denied(updateDoc(issue(owner, id), appeal({ reopenReason })))
  }
  for (const key of ['reopenReason', 'reopenedAt', 'updatedAt']) {
    const patch = appeal()
    delete patch[key]
    await denied(updateDoc(issue(owner, id), patch))
  }
  await denied(updateDoc(issue(owner, id), appeal({ reopenedAt: ago(1000) })))
  await denied(updateDoc(issue(owner, id), appeal({ updatedAt: ago(1000) })))
})

test('appeals cannot alter ownership, the resolution date, or unrelated fields', async () => {
  const id = await seed()
  for (const fields of [{ reportedBy: 'other' }, { resolvedAt: serverTimestamp() }, { title: 'Other title' }, { arbitraryField: true }]) {
    await denied(updateDoc(issue(owner, id), appeal(fields)))
  }
})

test('ordinary Pending edits and admin status updates still succeed', async () => {
  const id = await seed({ status: 'Pending' })
  await updateDoc(issue(owner, id), { title: 'Streetlight near school' })
  await updateDoc(issue(admin, id), { status: 'In Progress' })
  const saved = (await getDoc(issue(owner, id))).data()
  assert.equal(saved.title, 'Streetlight near school')
  assert.equal(saved.status, 'In Progress')
})
