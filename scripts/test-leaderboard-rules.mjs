// Load firestore.rules in a local emulator for demo-civic-leaderboard, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(
  process.env.FIRESTORE_EMULATOR_HOST || ''
)
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')

const projectId = 'demo-civic-leaderboard'
const aliceUid = `citizen-alice-${randomUUID()}`
const bobUid = `citizen-bob-${randomUUID()}`
const adminUid = `admin-${randomUUID()}`
const apps = []

function client(name, uid, role) {
  const app = initializeApp({ projectId }, `${name}-${randomUUID()}`)
  apps.push(app)
  const db = getFirestore(app)
  const options = uid ? { mockUserToken: { sub: uid, role } } : undefined
  connectFirestoreEmulator(db, endpoint[1], Number(endpoint[2]), options)
  return db
}

const alice = client('alice', aliceUid, 'citizen')
const bob = client('bob', bobUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signed-out')

after(() => Promise.all(apps.map(deleteApp)))

const denied = (promise) => assert.rejects(promise, { code: 'permission-denied' })
const leaderboardDoc = (db, uid) => doc(db, 'leaderboard', uid)
const userDoc = (db, uid) => doc(db, 'users', uid)

function validEntry(uid, name = 'Alice', overrides = {}) {
  return {
    uid,
    name,
    monthlyScore: 150,
    allTimeScore: 400,
    badgesCount: 3,
    reportsCount: 4,
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

test('citizen can create and update their own leaderboard projection with valid schema', async () => {
  const ref = leaderboardDoc(alice, aliceUid)
  await setDoc(ref, validEntry(aliceUid, 'Alice Citizen'))

  const snap = await getDoc(ref)
  assert.equal(snap.exists(), true)
  assert.equal(snap.data().name, 'Alice Citizen')
  assert.equal(snap.data().monthlyScore, 150)
  assert.equal(snap.data().allTimeScore, 400)
  assert.equal(snap.data().badgesCount, 3)
  assert.equal(snap.data().reportsCount, 4)

  // Update with higher score and new server timestamp
  await updateDoc(ref, {
    monthlyScore: 250,
    allTimeScore: 500,
    updatedAt: serverTimestamp(),
  })

  const updatedSnap = await getDoc(ref)
  assert.equal(updatedSnap.data().monthlyScore, 250)
  assert.equal(updatedSnap.data().allTimeScore, 500)
})

test('another citizen can read public leaderboard document', async () => {
  const aliceRef = leaderboardDoc(bob, aliceUid)
  const snap = await getDoc(aliceRef)
  assert.equal(snap.exists(), true)
  assert.equal(snap.data().name, 'Alice Citizen')
})

test('authenticated citizen can query the leaderboard collection ordered by monthlyScore', async () => {
  // Seed Bob's leaderboard entry
  await setDoc(leaderboardDoc(bob, bobUid), validEntry(bobUid, 'Bob Resident', { monthlyScore: 180 }))

  const q = query(collection(alice, 'leaderboard'), orderBy('monthlyScore', 'desc'), limit(10))
  const snap = await getDocs(q)
  assert.ok(snap.docs.length >= 2)
  const uids = snap.docs.map((d) => d.id)
  assert.ok(uids.includes(aliceUid))
  assert.ok(uids.includes(bobUid))
})

test('unauthenticated client cannot read or query leaderboard', async () => {
  await denied(getDoc(leaderboardDoc(signedOut, aliceUid)))
  await denied(getDocs(query(collection(signedOut, 'leaderboard'), limit(5))))
})

test('unauthenticated client cannot create or update leaderboard entries', async () => {
  await denied(setDoc(leaderboardDoc(signedOut, 'anon-1'), validEntry('anon-1', 'Anon')))
})

test('citizen cannot write to another citizen leaderboard document', async () => {
  await denied(
    setDoc(leaderboardDoc(bob, aliceUid), validEntry(aliceUid, 'Hacked by Bob', { monthlyScore: 9999 }))
  )
})

test('leaderboard write is rejected if uid does not match document ID', async () => {
  await denied(
    setDoc(leaderboardDoc(alice, aliceUid), validEntry('spoofed-uid', 'Alice'))
  )
})

test('leaderboard write is rejected if sensitive PII fields are included', async () => {
  // Attempt to inject email, phone, fcmTokens, or role
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { email: 'alice@example.com' })
    )
  )
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { phone: '+15550199' })
    )
  )
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { fcmTokens: ['evil-push-token'] })
    )
  )
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { role: 'admin' })
    )
  )
})

test('leaderboard write is rejected if updatedAt is not request.time', async () => {
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { updatedAt: Timestamp.fromDate(new Date('2020-01-01')) })
    )
  )
})

test('leaderboard write is rejected if score or count fields are negative or invalid', async () => {
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { monthlyScore: -50 })
    )
  )
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { monthlyScore: 'invalid-string' })
    )
  )
  await denied(
    setDoc(
      leaderboardDoc(alice, aliceUid),
      validEntry(aliceUid, 'Alice', { badgesCount: -1 })
    )
  )
})

test('citizen cannot delete their leaderboard entry, but admin can', async () => {
  await denied(deleteDoc(leaderboardDoc(alice, aliceUid)))

  // Admin delete succeeds
  const tempUid = `temp-user-${randomUUID()}`
  await setDoc(leaderboardDoc(admin, tempUid), validEntry(tempUid, 'Temporary'))
  await deleteDoc(leaderboardDoc(admin, tempUid))
  const deletedSnap = await getDoc(leaderboardDoc(admin, tempUid))
  assert.equal(deletedSnap.exists(), false)
})

test('private users collection remains strictly protected against unauthorized reads and queries', async () => {
  // Alice tries to read Bob's private user doc
  await denied(getDoc(userDoc(alice, bobUid)))

  // Alice tries to query the users collection
  await denied(getDocs(query(collection(alice, 'users'), limit(10))))
})
