import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteObject, getBytes, ref, updateMetadata, uploadBytes } from 'firebase/storage'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

const RULES = readFileSync(
  fileURLToPath(new URL('../../storage.rules', import.meta.url)),
  'utf8'
)
const FIRESTORE_RULES = readFileSync(
  fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
  'utf8'
)

const PROJECT_ID = 'demo-civic-connect'
const [STORAGE_HOST, STORAGE_PORT] = (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.STORAGE_EMULATOR_HOST ||
  '127.0.0.1:9199'
).split(':')
const [FIRESTORE_HOST, FIRESTORE_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST ||
  '127.0.0.1:8080'
).split(':')

let testEnv

// Deterministic byte buffers
const jpegData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const webmData = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00])
const mp4Data = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])

// Boundary byte arrays for 5MB photo limit
const PHOTO_MAX_BYTES = 5 * 1024 * 1024
const AUDIO_MAX_BYTES = 10 * 1024 * 1024

// Generate buffer of specified size (deterministic without heavy memory allocations)
function makeSizedBuffer(size) {
  const buf = new Uint8Array(size)
  buf[0] = 0xff
  buf[1] = 0xd8
  buf[buf.length - 1] = 0xd9
  return buf
}

describe('Storage Security Rules (Issue #254 Comprehensive Suite)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        host: STORAGE_HOST,
        port: Number(STORAGE_PORT),
        rules: RULES,
      },
      firestore: {
        host: FIRESTORE_HOST,
        port: Number(FIRESTORE_PORT),
        rules: FIRESTORE_RULES,
      },
    })
  })

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup()
    }
  })

  beforeEach(async () => {
    await testEnv.clearStorage()
    await testEnv.clearFirestore()

    // Seed test complaint in Firestore for ownership validation
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore()
      await setDoc(doc(db, 'issues', 'complaint-alice-1'), {
        complaintId: 'CMP-2026-0001',
        title: 'Broken streetlight',
        reportedBy: 'citizen-alice',
        status: 'Pending',
        createdAt: serverTimestamp(),
      })
      await setDoc(doc(db, 'users', 'admin-carol'), {
        role: 'admin',
      })
      await setDoc(doc(db, 'users', 'citizen-alice'), {
        role: 'citizen',
      })
    })
  })

  // Principal helpers
  const alice = () => testEnv.authenticatedContext('citizen-alice').storage()
  const bob = () => testEnv.authenticatedContext('citizen-bob').storage()
  const officer = () => testEnv.authenticatedContext('officer-dan', { role: 'officer' }).storage()
  const admin = () => testEnv.authenticatedContext('admin-carol', { role: 'admin' }).storage()
  const superAdmin = () => testEnv.authenticatedContext('superadmin-eve', { admin: true, role: 'admin' }).storage()
  const anon = () => testEnv.unauthenticatedContext().storage()

  describe('Principal Matrix & Unauthenticated Access', () => {
    it('DENIES unauthenticated uploads to complaint-photos', async () => {
      const fileRef = ref(anon(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertFails(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))
    })

    it('DENIES unauthenticated uploads to complaint-audio', async () => {
      const fileRef = ref(anon(), 'complaint-audio/complaint-alice-1/voice.webm')
      await assertFails(uploadBytes(fileRef, webmData, { contentType: 'audio/webm' }))
    })

    it('DENIES unauthenticated uploads to resolution-feedback', async () => {
      const fileRef = ref(anon(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertFails(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))
    })

    it('allows authenticated users to read complaint-photos and complaint-audio', async () => {
      // Seed photo as Alice
      const aliceRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(aliceRef, jpegData, { contentType: 'image/jpeg' }))

      // Bob (another citizen) can read complaint evidence
      const bobRef = ref(bob(), 'complaint-photos/complaint-alice-1/photo.jpg')
      const downloaded = await assertSucceeds(getBytes(bobRef))
      expect(downloaded.byteLength).toBe(jpegData.byteLength)
    })
  })

  describe('Complaint Photos (Max 5 MB & Allowed MIME Types)', () => {
    it('allows valid JPEG and PNG uploads under 5 MB', async () => {
      const jpgRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(jpgRef, jpegData, { contentType: 'image/jpeg' }))

      const pngRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.png')
      await assertSucceeds(uploadBytes(pngRef, pngData, { contentType: 'image/png' }))
    })

    it('DENIES empty (0-byte) files', async () => {
      const emptyRef = ref(alice(), 'complaint-photos/complaint-alice-1/empty.jpg')
      await assertFails(uploadBytes(emptyRef, new Uint8Array([]), { contentType: 'image/jpeg' }))
    })

    it('DENIES unsupported MIME types (text/plain, image/gif, image/svg+xml, application/octet-stream)', async () => {
      const plainRef = ref(alice(), 'complaint-photos/complaint-alice-1/test.txt')
      await assertFails(uploadBytes(plainRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))

      const gifRef = ref(alice(), 'complaint-photos/complaint-alice-1/test.gif')
      await assertFails(uploadBytes(gifRef, new Uint8Array([0x47, 0x49, 0x46]), { contentType: 'image/gif' }))

      const svgRef = ref(alice(), 'complaint-photos/complaint-alice-1/test.svg')
      await assertFails(uploadBytes(svgRef, new Uint8Array([0x3c, 0x73, 0x76, 0x67]), { contentType: 'image/svg+xml' }))

      const binRef = ref(alice(), 'complaint-photos/complaint-alice-1/test.bin')
      await assertFails(uploadBytes(binRef, new Uint8Array([1, 2, 3]), { contentType: 'application/octet-stream' }))
    })

    it('DENIES photo files exceeding 5 MB limit', async () => {
      const oversizedBuf = makeSizedBuffer(PHOTO_MAX_BYTES + 1)
      const overRef = ref(alice(), 'complaint-photos/complaint-alice-1/oversized.jpg')
      await assertFails(uploadBytes(overRef, oversizedBuf, { contentType: 'image/jpeg' }))
    })

    it('DENIES in-place modification/overwrite of existing photos', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))
      // In-place metadata updates are explicitly rejected: allow update: if false
      await assertFails(updateMetadata(fileRef, { customMetadata: { tag: 'tampered' } }))
    })
  })

  describe('Complaint Voice Audio (Max 10 MB & Allowed MIME Types)', () => {
    it('allows valid audio/webm and audio/mp4 uploads under 10 MB', async () => {
      const webmRef = ref(alice(), 'complaint-audio/complaint-alice-1/voice.webm')
      await assertSucceeds(uploadBytes(webmRef, webmData, { contentType: 'audio/webm' }))

      const mp4Ref = ref(alice(), 'complaint-audio/complaint-alice-1/voice.mp4')
      await assertSucceeds(uploadBytes(mp4Ref, mp4Data, { contentType: 'audio/mp4' }))
    })

    it('allows audio files up to 10 MB', async () => {
      // 6 MB is above the old 5 MB limit, but within the required 10 MB audio limit
      const sixMbBuf = makeSizedBuffer(6 * 1024 * 1024)
      const audioRef = ref(alice(), 'complaint-audio/complaint-alice-1/long-voice.webm')
      await assertSucceeds(uploadBytes(audioRef, sixMbBuf, { contentType: 'audio/webm' }))
    })

    it('DENIES audio files exceeding 10 MB limit', async () => {
      const oversizedAudioBuf = makeSizedBuffer(AUDIO_MAX_BYTES + 1)
      const overRef = ref(alice(), 'complaint-audio/complaint-alice-1/oversized.webm')
      await assertFails(uploadBytes(overRef, oversizedAudioBuf, { contentType: 'audio/webm' }))
    })

    it('DENIES unsupported MIME types for audio', async () => {
      const badRef = ref(alice(), 'complaint-audio/complaint-alice-1/bad.txt')
      await assertFails(uploadBytes(badRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))
    })
  })

  describe('Ownership & Deletion Rules', () => {
    it('allows complaint owner to delete their own evidence', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))
      await assertSucceeds(deleteObject(fileRef))
    })

    it('DENIES non-owner citizen from deleting complaint evidence', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))

      const bobRef = ref(bob(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertFails(deleteObject(bobRef))
    })

    it('allows Super Admin to delete complaint evidence', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))

      const adminRef = ref(admin(), 'complaint-photos/complaint-alice-1/photo.jpg')
      await assertSucceeds(deleteObject(adminRef))
    })

    it('allows Super Admin with custom claims to delete complaint evidence', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo2.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))

      const superRef = ref(superAdmin(), 'complaint-photos/complaint-alice-1/photo2.jpg')
      await assertSucceeds(deleteObject(superRef))
    })

    it('DENIES municipal department officer from deleting complaint evidence', async () => {
      const fileRef = ref(alice(), 'complaint-photos/complaint-alice-1/photo3.jpg')
      await assertSucceeds(uploadBytes(fileRef, jpegData, { contentType: 'image/jpeg' }))

      const officerRef = ref(officer(), 'complaint-photos/complaint-alice-1/photo3.jpg')
      await assertFails(deleteObject(officerRef))
    })
  })

  describe('Resolution Feedback Isolation & Path Traversal Prevention', () => {
    it('allows user to upload resolution feedback under their own userId path', async () => {
      const feedbackRef = ref(alice(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertSucceeds(uploadBytes(feedbackRef, jpegData, { contentType: 'image/jpeg' }))
    })

    it('DENIES user from uploading resolution feedback under another userId path', async () => {
      const spoofedRef = ref(bob(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertFails(uploadBytes(spoofedRef, jpegData, { contentType: 'image/jpeg' }))
    })

    it('DENIES non-owner citizen from reading another users resolution feedback', async () => {
      const feedbackRef = ref(alice(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertSucceeds(uploadBytes(feedbackRef, jpegData, { contentType: 'image/jpeg' }))

      const bobRef = ref(bob(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertFails(getBytes(bobRef))
    })

    it('allows admin to read any resolution feedback', async () => {
      const feedbackRef = ref(alice(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      await assertSucceeds(uploadBytes(feedbackRef, jpegData, { contentType: 'image/jpeg' }))

      const adminRef = ref(admin(), 'resolution-feedback/citizen-alice/complaint-alice-1/proof.jpg')
      const downloaded = await assertSucceeds(getBytes(adminRef))
      expect(downloaded.byteLength).toBe(jpegData.byteLength)
    })

    it('DENIES access to unmapped root or arbitrary paths', async () => {
      const rootRef = ref(alice(), 'secret.txt')
      await assertFails(uploadBytes(rootRef, new Uint8Array([1, 2, 3]), { contentType: 'text/plain' }))

      const arbitraryRef = ref(alice(), 'arbitrary/path/file.jpg')
      await assertFails(uploadBytes(arbitraryRef, jpegData, { contentType: 'image/jpeg' }))
    })
  })
})
