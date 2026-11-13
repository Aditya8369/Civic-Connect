// Load firestore.rules in a local emulator for demo-civic-merge, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectFirestoreEmulator, doc, getDoc, getFirestore,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-merge'
const parentAuthorUid = `parent-author-${randomUUID()}`
const mergedCitizenUid = `merged-citizen-${randomUUID()}`
const unrelatedCitizenUid = `unrelated-citizen-${randomUUID()}`
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

const parentAuthor = client('parentAuthor', parentAuthorUid, 'citizen')
const mergedCitizen = client('mergedCitizen', mergedCitizenUid, 'citizen')
const unrelatedCitizen = client('unrelatedCitizen', unrelatedCitizenUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signedOut')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const eventDoc = (db, issueId, eventId) => doc(db, 'issues', issueId, 'events', eventId)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

async function seedMergedComplaint() {
  const id = `parent-issue-${randomUUID()}`
  const eventId = `event-${randomUUID()}`

  // 1. Parent author creates primary complaint
  await setDoc(issue(parentAuthor, id), {
    title: 'Water main burst on 5th Ave',
    category: 'Water Leakage',
    status: 'Pending',
    reportedBy: parentAuthorUid,
    mergedReporters: [mergedCitizenUid],
    mergedChildIds: ['child-ticket-1'],
    mergedChildComplaintIds: ['CMP-2026-0002'],
  })

  // 2. Add an audit event on the parent complaint
  await setDoc(eventDoc(admin, id, eventId), {
    actorUid: adminUid,
    action: 'Duplicate complaint consolidated',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Consolidated duplicate report CMP-2026-0002',
    timestamp: serverTimestamp(),
  })

  return { id, eventId }
}

test('primary reporter can read parent complaint and its audit events', async () => {
  const { id, eventId } = await seedMergedComplaint()
  const complaintSnap = await getDoc(issue(parentAuthor, id))
  assert.equal(complaintSnap.exists(), true)
  assert.equal(complaintSnap.data().title, 'Water main burst on 5th Ave')

  const eventSnap = await getDoc(eventDoc(parentAuthor, id, eventId))
  assert.equal(eventSnap.exists(), true)
  assert.equal(eventSnap.data().action, 'Duplicate complaint consolidated')
})

test('consolidated reporter (in mergedReporters) can read parent complaint and audit events', async () => {
  const { id, eventId } = await seedMergedComplaint()
  const complaintSnap = await getDoc(issue(mergedCitizen, id))
  assert.equal(complaintSnap.exists(), true)
  assert.equal(complaintSnap.data().title, 'Water main burst on 5th Ave')
  assert.equal(complaintSnap.data().reportedBy, parentAuthorUid)

  const eventSnap = await getDoc(eventDoc(mergedCitizen, id, eventId))
  assert.equal(eventSnap.exists(), true)
  assert.equal(eventSnap.data().action, 'Duplicate complaint consolidated')
})

test('unrelated citizen is DENIED read access to parent complaint and audit events', async () => {
  const { id, eventId } = await seedMergedComplaint()
  await denied(getDoc(issue(unrelatedCitizen, id)))
  await denied(getDoc(eventDoc(unrelatedCitizen, id, eventId)))
})

test('unauthenticated request is DENIED read access', async () => {
  const { id, eventId } = await seedMergedComplaint()
  await denied(getDoc(issue(signedOut, id)))
  await denied(getDoc(eventDoc(signedOut, id, eventId)))
})

test('consolidated reporter CANNOT update or tamper with the parent complaint', async () => {
  const { id } = await seedMergedComplaint()
  await denied(updateDoc(issue(mergedCitizen, id), {
    title: 'Tampered title by merged reporter',
  }))
})

test('administrator can read parent complaint and audit events', async () => {
  const { id, eventId } = await seedMergedComplaint()
  const complaintSnap = await getDoc(issue(admin, id))
  assert.equal(complaintSnap.exists(), true)

  const eventSnap = await getDoc(eventDoc(admin, id, eventId))
  assert.equal(eventSnap.exists(), true)
})
