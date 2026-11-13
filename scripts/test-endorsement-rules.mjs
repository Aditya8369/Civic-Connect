// Load firestore.rules in a local emulator for demo-civic-endorsements, set
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
const projectId = 'demo-civic-endorsements'
const authorUid = `author-${randomUUID()}`
const endorserUid = `endorser-${randomUUID()}`
const secondEndorserUid = `endorser-two-${randomUUID()}`
const attackerUid = `attacker-${randomUUID()}`
const apps = []

function client(name, uid, role = 'citizen') {
  const app = initializeApp({ projectId }, name)
  apps.push(app)
  const db = getFirestore(app)
  const options = uid ? { mockUserToken: { sub: uid, role } } : undefined
  connectFirestoreEmulator(db, endpoint[1], Number(endpoint[2]), options)
  return db
}

const author = client('author', authorUid)
const endorser = client('endorser', endorserUid)
const secondEndorser = client('second-endorser', secondEndorserUid)
const attacker = client('attacker', attackerUid)
const admin = client('admin', `admin-${randomUUID()}`, 'admin')
const signedOut = client('signed-out')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

async function seedComplaint(overrides = {}) {
  const id = `issue-${randomUUID()}`
  const initialData = {
    title: 'Pothole on Main St',
    description: 'Deep road damage',
    category: 'Roads & Footpaths',
    status: 'Pending',
    reportedBy: authorUid,
    endorsedBy: [],
    endorsementCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
  await setDoc(issue(author, id), initialData)
  return id
}

test('authenticated citizens can query active complaints by category for duplicate detection', async () => {
  const id = await seedComplaint({ category: 'Street Lighting' })
  const q = query(collection(endorser, 'issues'), where('category', '==', 'Street Lighting'))
  const snapshot = await getDocs(q)
  assert.ok(snapshot.docs.length > 0)
  assert.ok(snapshot.docs.some(docSnap => docSnap.id === id))
})

test('unauthenticated clients cannot read complaints or query categories', async () => {
  const id = await seedComplaint()
  await denied(getDoc(issue(signedOut, id)))
  await denied(getDocs(query(collection(signedOut, 'issues'), where('category', '==', 'Roads & Footpaths'))))
})

test('cross-citizen endorsement succeeds and atomically appends caller UID and increments count', async () => {
  const id = await seedComplaint()
  await runTransaction(endorser, async transaction => {
    const snap = await transaction.get(issue(endorser, id))
    assert.equal(snap.exists(), true)
    const current = snap.data()
    transaction.update(issue(endorser, id), {
      endorsedBy: [...current.endorsedBy, endorserUid],
      endorsementCount: current.endorsementCount + 1,
      updatedAt: serverTimestamp(),
    })
  })

  const saved = (await getDoc(issue(author, id))).data()
  assert.deepEqual(saved.endorsedBy, [endorserUid])
  assert.equal(saved.endorsementCount, 1)

  // A second citizen can also endorse
  await runTransaction(secondEndorser, async transaction => {
    const snap = await transaction.get(issue(secondEndorser, id))
    const current = snap.data()
    transaction.update(issue(secondEndorser, id), {
      endorsedBy: [...current.endorsedBy, secondEndorserUid],
      endorsementCount: current.endorsementCount + 1,
      updatedAt: serverTimestamp(),
    })
  })

  const doubleEndorsed = (await getDoc(issue(author, id))).data()
  assert.deepEqual(doubleEndorsed.endorsedBy, [endorserUid, secondEndorserUid])
  assert.equal(doubleEndorsed.endorsementCount, 2)
})

test('cannot endorse a complaint more than once with the same UID', async () => {
  const id = await seedComplaint({ endorsedBy: [endorserUid], endorsementCount: 1 })
  await denied(
    runTransaction(endorser, async transaction => {
      const snap = await transaction.get(issue(endorser, id))
      const current = snap.data()
      transaction.update(issue(endorser, id), {
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount + 1,
        updatedAt: serverTimestamp(),
      })
    })
  )
})

test('cannot spoof another citizen UID into endorsedBy', async () => {
  const id = await seedComplaint()
  // Attacker attempts to add endorserUid instead of attackerUid
  await denied(
    runTransaction(attacker, async transaction => {
      const snap = await transaction.get(issue(attacker, id))
      const current = snap.data()
      transaction.update(issue(attacker, id), {
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount + 1,
        updatedAt: serverTimestamp(),
      })
    })
  )
})

test('cannot tamper with endorsementCount arbitrarily (e.g. +2 or reset)', async () => {
  const id = await seedComplaint()
  // Count + 2
  await denied(
    runTransaction(endorser, async transaction => {
      const snap = await transaction.get(issue(endorser, id))
      const current = snap.data()
      transaction.update(issue(endorser, id), {
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount + 2,
        updatedAt: serverTimestamp(),
      })
    })
  )

  // Count remains unchanged
  await denied(
    runTransaction(endorser, async transaction => {
      const snap = await transaction.get(issue(endorser, id))
      const current = snap.data()
      transaction.update(issue(endorser, id), {
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount,
        updatedAt: serverTimestamp(),
      })
    })
  )
})

test('cannot modify other fields (title, status, reportedBy) during endorsement', async () => {
  const id = await seedComplaint()
  await denied(
    runTransaction(endorser, async transaction => {
      const snap = await transaction.get(issue(endorser, id))
      const current = snap.data()
      transaction.update(issue(endorser, id), {
        title: 'Tampered Title',
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount + 1,
        updatedAt: serverTimestamp(),
      })
    })
  )

  await denied(
    runTransaction(endorser, async transaction => {
      const snap = await transaction.get(issue(endorser, id))
      const current = snap.data()
      transaction.update(issue(endorser, id), {
        status: 'Resolved',
        endorsedBy: [...current.endorsedBy, endorserUid],
        endorsementCount: current.endorsementCount + 1,
        updatedAt: serverTimestamp(),
      })
    })
  )
})

test('cannot forge updatedAt with past or future timestamps during endorsement', async () => {
  const id = await seedComplaint()
  const fakeTime = Timestamp.fromMillis(Date.now() - 60000)
  await denied(
    updateDoc(issue(endorser, id), {
      endorsedBy: [endorserUid],
      endorsementCount: 1,
      updatedAt: fakeTime,
    })
  )
})

test('legacy complaints without endorsedBy or endorsementCount can be endorsed', async () => {
  const id = `legacy-${randomUUID()}`
  await setDoc(issue(author, id), {
    title: 'Legacy Complaint',
    category: 'Water Supply',
    status: 'Pending',
    reportedBy: authorUid,
  })

  await runTransaction(endorser, async transaction => {
    const snap = await transaction.get(issue(endorser, id))
    const current = snap.data()
    const endorsers = Array.isArray(current.endorsedBy) ? current.endorsedBy : []
    const count = typeof current.endorsementCount === 'number' ? current.endorsementCount : endorsers.length
    transaction.update(issue(endorser, id), {
      endorsedBy: [...endorsers, endorserUid],
      endorsementCount: count + 1,
      updatedAt: serverTimestamp(),
    })
  })

  const saved = (await getDoc(issue(author, id))).data()
  assert.deepEqual(saved.endorsedBy, [endorserUid])
  assert.equal(saved.endorsementCount, 1)
})

test('authenticated citizens can read event audit trail on community complaints', async () => {
  const id = await seedComplaint()
  const eventRef = doc(collection(issue(author, id), 'events'))
  await setDoc(eventRef, {
    actorUid: authorUid,
    action: 'Status changed',
    previousStatus: 'Pending',
    newStatus: 'In Progress',
    remarks: 'Crew assigned',
    timestamp: serverTimestamp(),
  })

  const events = await getDocs(collection(issue(endorser, id), 'events'))
  assert.equal(events.size, 1)
  assert.equal(events.docs[0].data().action, 'Status changed')
})

test('admin can update complaint status or fields independently of citizen rules', async () => {
  const id = await seedComplaint()
  await updateDoc(issue(admin, id), { status: 'In Progress', department: 'Roads' })
  const saved = (await getDoc(issue(admin, id))).data()
  assert.equal(saved.status, 'In Progress')
  assert.equal(saved.department, 'Roads')
})

