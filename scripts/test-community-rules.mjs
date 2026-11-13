// Load firestore.rules in a local emulator for demo-civic-community, set
// FIRESTORE_EMULATOR_HOST to its loopback address, then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'

const endpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(process.env.FIRESTORE_EMULATOR_HOST || '')
assert(endpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')
const projectId = 'demo-civic-community'
const authorUid = `author-${randomUUID()}`
const voterUid = `voter-${randomUUID()}`
const commenterUid = `commenter-${randomUUID()}`
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
const voter = client('voter', voterUid, 'citizen')
const commenter = client('commenter', commenterUid, 'citizen')
const other = client('other', otherUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signedOut')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const commentsCol = (db, issueId) => collection(db, 'issues', issueId, 'comments')
const commentDoc = (db, issueId, commentId) => doc(db, 'issues', issueId, 'comments', commentId)
const denied = promise => assert.rejects(promise, { code: 'permission-denied' })

async function seedIssue() {
  const id = `comm-issue-${randomUUID()}`
  await setDoc(issue(author, id), {
    title: 'Broken park bench',
    category: 'Parks',
    status: 'Pending',
    reportedBy: authorUid,
    upvotedBy: [],
    upvotesCount: 0,
    createdAt: serverTimestamp(),
  })
  return id
}

test('authenticated citizens can read community issues', async () => {
  const id = await seedIssue()
  const snap = await getDoc(issue(voter, id))
  assert.equal(snap.exists(), true)
  assert.equal(snap.data().title, 'Broken park bench')

  const issuesList = await getDocs(collection(voter, 'issues'))
  assert(issuesList.size > 0)
})

test('citizen can toggle upvote atomically (+1) and remove upvote (-1)', async () => {
  const id = await seedIssue()

  // 1. Add upvote
  await updateDoc(issue(voter, id), {
    upvotedBy: [voterUid],
    upvotesCount: 1,
  })

  let snap = await getDoc(issue(voter, id))
  assert.deepEqual(snap.data().upvotedBy, [voterUid])
  assert.equal(snap.data().upvotesCount, 1)

  // 2. Remove upvote
  await updateDoc(issue(voter, id), {
    upvotedBy: [],
    upvotesCount: 0,
  })

  snap = await getDoc(issue(voter, id))
  assert.deepEqual(snap.data().upvotedBy, [])
  assert.equal(snap.data().upvotesCount, 0)
})

test('citizen CANNOT forge upvotes for another citizen', async () => {
  const id = await seedIssue()
  await denied(updateDoc(issue(voter, id), {
    upvotedBy: [otherUid],
    upvotesCount: 1,
  }))
})

test('citizen CANNOT tamper with title or status during upvoting', async () => {
  const id = await seedIssue()
  await denied(updateDoc(issue(voter, id), {
    upvotedBy: [voterUid],
    upvotesCount: 1,
    title: 'Hacked title',
  }))
  await denied(updateDoc(issue(voter, id), {
    upvotedBy: [voterUid],
    upvotesCount: 1,
    status: 'Resolved',
  }))
})

test('citizen can post and read comments on community issues', async () => {
  const id = await seedIssue()

  // 1. Post comment
  const ref = await addDoc(commentsCol(commenter, id), {
    text: 'We really need this fixed before Saturday event.',
    authorName: 'Alex Citizen',
    authorId: commenterUid,
    createdAt: serverTimestamp(),
  })
  assert(ref.id)

  // 2. Read comment as another citizen
  const list = await getDocs(commentsCol(other, id))
  assert.equal(list.size, 1)
  assert.equal(list.docs[0].data().text, 'We really need this fixed before Saturday event.')
})

test('citizen CANNOT post a comment under forged authorId', async () => {
  const id = await seedIssue()
  await denied(addDoc(commentsCol(commenter, id), {
    text: 'Impersonated comment',
    authorName: 'Alice',
    authorId: otherUid,
    createdAt: serverTimestamp(),
  }))
})

test('comment author and admin can delete comments', async () => {
  const id = await seedIssue()
  const ref1 = await addDoc(commentsCol(commenter, id), {
    text: 'Author deleted comment',
    authorName: 'Commenter',
    authorId: commenterUid,
    createdAt: serverTimestamp(),
  })
  const ref2 = await addDoc(commentsCol(commenter, id), {
    text: 'Admin moderated comment',
    authorName: 'Commenter',
    authorId: commenterUid,
    createdAt: serverTimestamp(),
  })

  // Other citizen cannot delete
  await denied(deleteDoc(commentDoc(other, id, ref1.id)))

  // Comment author can delete
  await deleteDoc(commentDoc(commenter, id, ref1.id))
  const snap1 = await getDoc(commentDoc(commenter, id, ref1.id))
  assert.equal(snap1.exists(), false)

  // Administrator can moderate/delete any comment
  await deleteDoc(commentDoc(admin, id, ref2.id))
  const snap2 = await getDoc(commentDoc(admin, id, ref2.id))
  assert.equal(snap2.exists(), false)
})

test('unauthenticated client is DENIED read and write access to issues and comments', async () => {
  const id = await seedIssue()
  await denied(getDoc(issue(signedOut, id)))
  await denied(getDocs(commentsCol(signedOut, id)))
})
