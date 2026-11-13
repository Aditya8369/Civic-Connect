// Load firestore.rules in a local emulator for demo-civic-feedback, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectFirestoreEmulator, doc, getDoc, getFirestore,
  serverTimestamp, setDoc, Timestamp, updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-feedback'
const ownerUid = `feedback-owner-${randomUUID()}`
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

async function seed({ status = 'Resolved', resolvedAt = ago(60000), feedback = null } = {}) {
  const id = `feedback-${randomUUID()}`
  await setDoc(issue(owner, id), {
    status: 'Pending',
    reportedBy: ownerUid,
    title: 'Pothole repair',
    department: 'Roads',
    createdAt: ago(120000),
    updatedAt: ago(120000),
  })
  if (status !== 'Pending' || feedback) {
    const patch = { status }
    if (resolvedAt !== null) patch.resolvedAt = resolvedAt
    if (feedback !== null) patch.feedback = feedback
    await updateDoc(issue(admin, id), patch)
  }
  return id
}

function feedbackPayload(overrides = {}) {
  return {
    feedback: {
      rating: 5,
      comment: 'Repaired quickly and thoroughly. Great work!',
      submittedAt: serverTimestamp(),
      ...(overrides.feedback || {}),
    },
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

test('owner can submit valid feedback on a resolved complaint', async () => {
  const id = await seed()
  const original = (await getDoc(issue(admin, id))).data()

  await updateDoc(issue(owner, id), feedbackPayload())

  const saved = (await getDoc(issue(admin, id))).data()
  assert.equal(saved.status, 'Resolved')
  assert.equal(saved.feedback.rating, 5)
  assert.equal(saved.feedback.comment, 'Repaired quickly and thoroughly. Great work!')
  assert(saved.feedback.submittedAt)
  assert(saved.updatedAt)
  assert.equal(saved.title, original.title)
  assert.equal(saved.reportedBy, original.reportedBy)
})

test('owner can submit feedback with empty comment or omitted comment', async () => {
  const id1 = await seed()
  await updateDoc(issue(owner, id1), {
    feedback: {
      rating: 4,
      comment: '',
      submittedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  })
  const saved1 = (await getDoc(issue(admin, id1))).data()
  assert.equal(saved1.feedback.rating, 4)
  assert.equal(saved1.feedback.comment, '')

  const id2 = await seed()
  await updateDoc(issue(owner, id2), {
    feedback: {
      rating: 3,
      submittedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  })
  const saved2 = (await getDoc(issue(admin, id2))).data()
  assert.equal(saved2.feedback.rating, 3)
})

test('another citizen and an unauthenticated client cannot submit feedback', async () => {
  const id = await seed()
  await denied(updateDoc(issue(other, id), feedbackPayload()))
  await denied(updateDoc(issue(signedOut, id), feedbackPayload()))
})

test('only Resolved complaints can receive feedback', async () => {
  for (const status of ['Pending', 'Rejected', 'In Progress', 'Reopened']) {
    const id = await seed({ status })
    await denied(updateDoc(issue(owner, id), feedbackPayload()))
  }
})

test('ratings must be an integer from 1 to 5', async () => {
  const id = await seed()
  for (const rating of [0, 6, -1, 3.5, '5', null, true]) {
    await denied(
      updateDoc(issue(owner, id), {
        feedback: { rating, comment: 'Good', submittedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      })
    )
  }
})

test('comments must be strings and at most 1000 characters', async () => {
  const id = await seed()
  const longComment = 'a'.repeat(1001)
  await denied(
    updateDoc(issue(owner, id), {
      feedback: { rating: 5, comment: longComment, submittedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    })
  )
  await denied(
    updateDoc(issue(owner, id), {
      feedback: { rating: 5, comment: 12345, submittedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    })
  )
})

test('cannot overwrite already submitted feedback', async () => {
  const id = await seed({
    feedback: {
      rating: 4,
      comment: 'Initial feedback',
      submittedAt: ago(30000),
    },
  })
  // Attempting to overwrite existing feedback must fail
  await denied(
    updateDoc(issue(owner, id), {
      feedback: { rating: 1, comment: 'Changed my mind', submittedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    })
  )
})

test('feedback cannot alter ownership, status, or unrelated complaint fields', async () => {
  const id = await seed()
  for (const field of [
    { reportedBy: 'other-user' },
    { status: 'Pending' },
    { status: 'In Progress' },
    { title: 'Manipulated title' },
    { department: 'Sanitation' },
    { maliciousField: true },
  ]) {
    await denied(
      updateDoc(issue(owner, id), {
        ...feedbackPayload(),
        ...field,
      })
    )
  }
})

test('feedback requires server timestamp on submittedAt and updatedAt', async () => {
  const id = await seed()
  await denied(
    updateDoc(issue(owner, id), {
      feedback: { rating: 5, comment: 'Nice', submittedAt: ago(5000) },
      updatedAt: serverTimestamp(),
    })
  )
  await denied(
    updateDoc(issue(owner, id), {
      feedback: { rating: 5, comment: 'Nice', submittedAt: serverTimestamp() },
      updatedAt: ago(5000),
    })
  )
})

test('citizen appeals can still be submitted on a resolved complaint that already has feedback', async () => {
  const id = await seed()
  // 1. Submit feedback
  await updateDoc(issue(owner, id), feedbackPayload())
  const afterFeedback = (await getDoc(issue(admin, id))).data()
  assert.equal(afterFeedback.status, 'Resolved')
  assert.equal(afterFeedback.feedback.rating, 5)

  // 2. Submit appeal within 7 days
  await updateDoc(issue(owner, id), {
    status: 'Reopened',
    reopenReason: 'The road cracked again after rain',
    reopenedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const afterAppeal = (await getDoc(issue(admin, id))).data()
  assert.equal(afterAppeal.status, 'Reopened')
  assert.equal(afterAppeal.reopenReason, 'The road cracked again after rain')
  // Original feedback is preserved
  assert.equal(afterAppeal.feedback.rating, 5)
})
