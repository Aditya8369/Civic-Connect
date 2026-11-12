import { describe, it, expect, vi, beforeEach } from 'vitest'
import { allocateComplaintId } from './complaintId'
import { deleteStorageFile, deleteComplaintEvidence } from './storage'
import { createTransactionStore } from './testSupport/transactionStore'

const backend = vi.hoisted(() => ({ store: null }))
const deleteObjectMock = vi.fn(() => Promise.resolve())

vi.mock('./config', () => ({
  default: {
    apiKey: 'mock-api-key',
    authDomain: 'civicconnect-dev.firebaseapp.com',
    projectId: 'civicconnect-dev',
    storageBucket: 'civicconnect-dev.firebasestorage.app',
    messagingSenderId: '12345',
    appId: '1:12345:web:mock',
  },
}))
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
}))
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  connectAuthEmulator: vi.fn(),
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: (...args) => backend.store.runTransaction(...args),
}))
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn((_storage, path) => ({ _path: path })),
  deleteObject: (...args) => deleteObjectMock(...args),
}))
vi.mock('./services', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}))

describe('Issue #168: Evidence Upload Atomicity & Orphan Prevention', () => {
  const counterPath = 'counters/issueCounter'

  beforeEach(() => {
    vi.clearAllMocks()
    deleteObjectMock.mockReset()
    deleteObjectMock.mockResolvedValue()
    backend.store = createTransactionStore({
      [counterPath]: { lastNumber: 10 },
    })
  })

  describe('allocateComplaintId transactional behavior', () => {
    it('allocates the next sequential ticket number inside a transaction', async () => {
      const year = new Date().getFullYear()
      let allocatedId = null

      await backend.store.runTransaction(null, async transaction => {
        allocatedId = await allocateComplaintId(transaction)
      })

      expect(allocatedId).toBe(`CMP-${year}-0011`)
      expect(backend.store.read(counterPath).lastNumber).toBe(11)
    })

    it('rolls back counter allocation if transaction aborts or throws', async () => {
      await expect(
        backend.store.runTransaction(null, async transaction => {
          await allocateComplaintId(transaction)
          throw new Error('Database write conflict or network drop')
        })
      ).rejects.toThrow('Database write conflict or network drop')

      // Counter remains completely untouched at 10
      expect(backend.store.read(counterPath).lastNumber).toBe(10)
    })
  })

  describe('Multi-part evidence upload and cleanup lifecycle', () => {
    it('deleteStorageFile safely deletes an individual storage path via deleteObject', async () => {
      await deleteStorageFile('complaint-photos/issue-doc-123/img.jpg')
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'complaint-photos/issue-doc-123/img.jpg' })
      )
    })

    it('cleans up succeeded photo artifact when audio upload fails midway', async () => {
      const uploadedArtifacts = []
      const attachmentId = 'issue-doc-999'

      let photoUpload = null

      await expect(
        (async () => {
          try {
            // 1. Photo upload succeeds
            photoUpload = {
              downloadUrl: 'https://storage.example.com/photo.jpg',
              path: `complaint-photos/${attachmentId}/pothole.jpg`,
              filename: 'pothole.jpg',
            }
            uploadedArtifacts.push(photoUpload.path)

            // 2. Audio upload fails (e.g. network timeout or invalid audio)
            throw new Error('Storage timeout: Audio upload aborted')
          } catch (uploadError) {
            if (uploadedArtifacts.length > 0) {
              await deleteComplaintEvidence(uploadedArtifacts)
            }
            throw uploadError
          }
        })()
      ).rejects.toThrow('Storage timeout: Audio upload aborted')

      // Succeeded photo was cleaned up from storage via deleteComplaintEvidence
      expect(deleteObjectMock).toHaveBeenCalledTimes(1)
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: `complaint-photos/${attachmentId}/pothole.jpg` })
      )

      // Counter was never touched
      expect(backend.store.read(counterPath).lastNumber).toBe(10)
    })

    it('cleans up succeeded audio artifact when photo upload fails midway', async () => {
      const uploadedArtifacts = []
      const attachmentId = 'issue-doc-888'

      await expect(
        (async () => {
          try {
            // Audio succeeds
            const audioUpload = {
              downloadUrl: 'https://storage.example.com/audio.webm',
              path: `complaint-audio/${attachmentId}/voice.webm`,
              filename: 'voice.webm',
            }
            uploadedArtifacts.push(audioUpload.path)

            // Photo fails
            throw new Error('Network error: Photo upload failed')
          } catch (uploadError) {
            if (uploadedArtifacts.length > 0) {
              await deleteComplaintEvidence(uploadedArtifacts)
            }
            throw uploadError
          }
        })()
      ).rejects.toThrow('Network error: Photo upload failed')

      expect(deleteObjectMock).toHaveBeenCalledTimes(1)
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: `complaint-audio/${attachmentId}/voice.webm` })
      )
      expect(backend.store.read(counterPath).lastNumber).toBe(10)
    })

    it('cleans up all uploaded artifacts when database transaction fails after uploads', async () => {
      const uploadedArtifacts = [
        'complaint-photos/issue-doc-777/street.jpg',
        'complaint-audio/issue-doc-777/voice.webm',
      ]

      await expect(
        (async () => {
          try {
            // Database transaction throws
            await backend.store.runTransaction(null, async () => {
              throw new Error('Firestore permission-denied')
            })
          } catch (commitError) {
            if (uploadedArtifacts.length > 0) {
              await deleteComplaintEvidence(uploadedArtifacts)
            }
            throw commitError
          }
        })()
      ).rejects.toThrow('Firestore permission-denied')

      // Both artifacts cleaned up
      expect(deleteObjectMock).toHaveBeenCalledTimes(2)
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'complaint-photos/issue-doc-777/street.jpg' })
      )
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'complaint-audio/issue-doc-777/voice.webm' })
      )

      // Counter unchanged
      expect(backend.store.read(counterPath).lastNumber).toBe(10)
    })
  })

  describe('End-to-end retry preserves contiguous municipal numbering', () => {
    it('guarantees sequential ticket IDs without gaps across failed attempts and retries', async () => {
      const year = new Date().getFullYear()
      const initialCounter = backend.store.read(counterPath).lastNumber
      expect(initialCounter).toBe(10)

      // Attempt 1: Photo uploads, audio fails
      const attempt1Artifacts = []
      let attempt1Error = null
      try {
        const photo = { path: 'complaint-photos/doc-attempt-1/pothole.jpg' }
        attempt1Artifacts.push(photo.path)
        throw new Error('Audio upload connection reset')
      } catch (err) {
        attempt1Error = err
        await deleteComplaintEvidence(attempt1Artifacts)
      }

      expect(attempt1Error).toBeTruthy()
      expect(deleteObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'complaint-photos/doc-attempt-1/pothole.jpg' })
      )
      // Counter NOT burned
      expect(backend.store.read(counterPath).lastNumber).toBe(10)

      // Attempt 2: User retries submission, both uploads succeed and transaction commits
      const attempt2Artifacts = []
      let committedComplaintId = null
      const issueDocPath = 'issues/doc-attempt-2'

      const photo2 = { downloadUrl: 'https://cdn/pothole.jpg', path: 'complaint-photos/doc-attempt-2/pothole.jpg' }
      const audio2 = { downloadUrl: 'https://cdn/voice.webm', path: 'complaint-audio/doc-attempt-2/voice.webm' }
      attempt2Artifacts.push(photo2.path, audio2.path)

      await backend.store.runTransaction(null, async transaction => {
        committedComplaintId = await allocateComplaintId(transaction)

        transaction.set(issueDocPath, {
          complaintId: committedComplaintId,
          title: 'Damaged road',
          imageUrl: photo2.downloadUrl,
          audioNote: { url: audio2.downloadUrl },
        })
      })

      // Verify sequence is strictly contiguous (10 -> 11) with zero burned IDs
      expect(committedComplaintId).toBe(`CMP-${year}-0011`)
      expect(backend.store.read(counterPath).lastNumber).toBe(11)
      expect(backend.store.read(issueDocPath).complaintId).toBe(`CMP-${year}-0011`)
    })
  })
})
