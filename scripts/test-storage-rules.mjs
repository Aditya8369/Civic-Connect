// Load storage.rules and firestore.rules in local emulators for demo-civic-storage, set
// STORAGE_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST to their loopback addresses,
// then run this file with node --test.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { deleteApp, initializeApp } from 'firebase/app'
import {
  connectFirestoreEmulator, doc, getFirestore, setDoc,
} from 'firebase/firestore'
import {
  connectStorageEmulator, deleteObject, getBytes, getStorage, ref, uploadBytes,
} from 'firebase/storage'

const storageEndpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(
  process.env.STORAGE_EMULATOR_HOST || process.env.FIREBASE_STORAGE_EMULATOR_HOST || ''
)
const firestoreEndpoint = /^(127\.0\.0\.1|localhost):(\d+)$/.exec(
  process.env.FIRESTORE_EMULATOR_HOST || ''
)
assert(storageEndpoint, 'Set STORAGE_EMULATOR_HOST to a loopback Storage Emulator')
assert(firestoreEndpoint, 'Set FIRESTORE_EMULATOR_HOST to a loopback Firestore Emulator')

const projectId = 'demo-civic-storage'
const ownerUid = `owner-${randomUUID()}`
const otherUid = `other-${randomUUID()}`
const adminUid = `admin-${randomUUID()}`
const apps = []

function client(name, uid, role) {
  const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, name)
  apps.push(app)
  const db = getFirestore(app)
  const storage = getStorage(app)
  const options = uid ? { mockUserToken: { sub: uid, role } } : undefined
  connectFirestoreEmulator(db, firestoreEndpoint[1], Number(firestoreEndpoint[2]), options)
  connectStorageEmulator(storage, storageEndpoint[1], Number(storageEndpoint[2]), options)
  return { db, storage }
}

const owner = client('owner', ownerUid, 'citizen')
const other = client('other', otherUid, 'citizen')
const admin = client('admin', adminUid, 'admin')
const signedOut = client('signedOut')
after(() => Promise.all(apps.map(deleteApp)))

const issue = (db, id) => doc(db, 'issues', id)
const userDoc = (db, id) => doc(db, 'users', id)

const denied = promise => assert.rejects(promise, (err) => {
  return err.code === 'storage/unauthorized' || err.code === 'permission-denied'
})

const jpegData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const webmData = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])

test('authenticated citizen can upload photo evidence within size and mime limits', async () => {
  const complaintId = `complaint-${randomUUID()}`
  const fileRef = ref(owner.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' })
  const downloaded = await getBytes(ref(owner.storage, `complaint-photos/${complaintId}/photo.jpg`))
  assert.equal(downloaded.byteLength, jpegData.byteLength)
})

test('unauthenticated request cannot upload complaint photos', async () => {
  const complaintId = `complaint-${randomUUID()}`
  const fileRef = ref(signedOut.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await denied(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))
})

test('cannot upload non-allowed mime types to complaint photos', async () => {
  const complaintId = `complaint-${randomUUID()}`
  const fileRef = ref(owner.storage, `complaint-photos/${complaintId}/script.sh`)
  await denied(uploadBytes(fileRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))
})

test('cannot overwrite existing complaint photo in place', async () => {
  const complaintId = `complaint-${randomUUID()}`
  const fileRef = ref(owner.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' })
  // In-place update must be rejected
  await denied(uploadBytes(fileRef, new Uint8Array([1, 2, 3, 4]), { contentType: 'image/jpeg' }))
})

test('other citizen cannot delete complaint evidence once issue document exists', async () => {
  const complaintId = `complaint-${randomUUID()}`
  await setDoc(issue(owner.db, complaintId), {
    reportedBy: ownerUid,
    status: 'Pending',
    title: 'Street light repair',
  })

  const fileRef = ref(owner.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' })

  // Other citizen attempts deletion
  const otherRef = ref(other.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await denied(deleteObject(otherRef))

  // Complaint owner can delete their evidence
  await deleteObject(fileRef)
})

test('admin can delete complaint photo evidence', async () => {
  const complaintId = `complaint-${randomUUID()}`
  await setDoc(issue(owner.db, complaintId), {
    reportedBy: ownerUid,
    status: 'Pending',
  })
  const fileRef = ref(owner.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' })

  const adminRef = ref(admin.storage, `complaint-photos/${complaintId}/photo.jpg`)
  await deleteObject(adminRef)
})

test('citizen can upload resolution feedback attachment to their own path', async () => {
  const issueId = `issue-${randomUUID()}`
  const feedbackRef = ref(owner.storage, `resolution-feedback/${ownerUid}/${issueId}/proof.jpg`)
  await uploadBytes(feedbackRef, jpegData, { contentType: 'image/jpeg' })

  const downloaded = await getBytes(feedbackRef)
  assert.equal(downloaded.byteLength, jpegData.byteLength)
})

test('citizen cannot upload resolution feedback under another citizen uid', async () => {
  const issueId = `issue-${randomUUID()}`
  const spoofedRef = ref(other.storage, `resolution-feedback/${ownerUid}/${issueId}/proof.jpg`)
  await denied(uploadBytes(spoofedRef, jpegData, { contentType: 'image/jpeg' }))
})

test('other citizen cannot delete resolution feedback attachment', async () => {
  const issueId = `issue-${randomUUID()}`
  const feedbackRef = ref(owner.storage, `resolution-feedback/${ownerUid}/${issueId}/proof.jpg`)
  await uploadBytes(feedbackRef, jpegData, { contentType: 'image/jpeg' })

  const otherRef = ref(other.storage, `resolution-feedback/${ownerUid}/${issueId}/proof.jpg`)
  await denied(deleteObject(otherRef))

  // Owner can delete their own feedback attachment
  await deleteObject(feedbackRef)
})

test('access to unmapped paths is denied', async () => {
  const arbitraryRef = ref(owner.storage, 'arbitrary/secret.txt')
  await denied(uploadBytes(arbitraryRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))
})
