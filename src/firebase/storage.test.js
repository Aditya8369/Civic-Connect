import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateComplaintPhoto,
  sanitizeFilename,
  uploadComplaintPhoto,
  deleteStorageFile,
  deleteComplaintEvidence,
  MAX_PHOTO_SIZE_BYTES,
} from './storage'

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
  getFirestore: vi.fn(() => ({})),
  connectFirestoreEmulator: vi.fn(),
}))
vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
  ref: vi.fn((_storage, path) => ({ _path: path })),
  uploadBytes: vi.fn(() => Promise.resolve({})),
  getDownloadURL: vi.fn(() => Promise.resolve('https://storage.googleapis.com/test-bucket/photo.jpg')),
  deleteObject: vi.fn(() => Promise.resolve()),
}))
vi.mock('./services', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}))

describe('Firebase Storage Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateComplaintPhoto', () => {
    it('returns invalid if no file is provided', () => {
      const result = validateComplaintPhoto(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Please select a photo file.')
    })

    it('returns invalid if selected file is empty (0 bytes)', () => {
      const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })
      const result = validateComplaintPhoto(emptyFile)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('file is empty')
    })

    it('accepts valid JPEG image under 5MB', () => {
      const file = new File(['fake-image-bytes'], 'pothole.jpg', { type: 'image/jpeg' })
      const result = validateComplaintPhoto(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('accepts valid PNG image under 5MB', () => {
      const file = new File(['fake-image-bytes'], 'leak.png', { type: 'image/png' })
      const result = validateComplaintPhoto(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('accepts image by extension when browser omits MIME type', () => {
      const file = new File(['fake-image-bytes'], 'camera_shot.JPG', { type: '' })
      const result = validateComplaintPhoto(file)
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects files larger than 5MB', () => {
      const largeBytes = new Uint8Array(MAX_PHOTO_SIZE_BYTES + 1)
      const file = new File([largeBytes], 'huge.jpg', { type: 'image/jpeg' })
      const result = validateComplaintPhoto(file)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('exceeds 5MB limit')
    })

    it('rejects unsupported file formats like pdf, gif, or text', () => {
      const pdfFile = new File(['%PDF-1.4'], 'doc.pdf', { type: 'application/pdf' })
      expect(validateComplaintPhoto(pdfFile).valid).toBe(false)
      expect(validateComplaintPhoto(pdfFile).error).toContain('Only JPG and PNG images are supported')

      const gifFile = new File(['GIF89a'], 'anim.gif', { type: 'image/gif' })
      expect(validateComplaintPhoto(gifFile).valid).toBe(false)

      const txtFile = new File(['hello'], 'note.txt', { type: 'text/plain' })
      expect(validateComplaintPhoto(txtFile).valid).toBe(false)
    })
  })

  describe('sanitizeFilename', () => {
    it('strips directory paths from filename', () => {
      expect(sanitizeFilename('../../../secret.jpg')).toBe('secret.jpg')
      expect(sanitizeFilename('/etc/passwd.png')).toBe('passwd.png')
    })

    it('replaces dangerous and special characters with underscores', () => {
      expect(sanitizeFilename('my photo (1) [final]!.jpg')).toBe('my_photo__1___final__.jpg')
    })

    it('falls back to default if name evaluates to empty', () => {
      expect(sanitizeFilename('')).toBe('photo.jpg')
      expect(sanitizeFilename('///')).toBe('photo.jpg')
    })
  })

  describe('uploadComplaintPhoto', () => {
    it('throws error if complaintId is missing', async () => {
      const file = new File(['test'], 'img.jpg', { type: 'image/jpeg' })
      await expect(uploadComplaintPhoto(file, '')).rejects.toThrow(
        'A valid complaint ID is required for photo upload.'
      )
    })

    it('throws error if file validation fails', async () => {
      const pdfFile = new File(['pdf'], 'doc.pdf', { type: 'application/pdf' })
      await expect(uploadComplaintPhoto(pdfFile, 'CMP-2026-0001')).rejects.toThrow(
        'Invalid file format'
      )
    })

    it('uploads to path complaint-photos/{complaintId}/{filename} and returns download URL', async () => {
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage')
      const fakeStorage = {}
      const file = new File(['image-content'], 'evidence.jpg', { type: 'image/jpeg' })

      const result = await uploadComplaintPhoto(file, 'CMP-2026-0001', fakeStorage)

      expect(ref).toHaveBeenCalledWith(
        fakeStorage,
        'complaint-photos/CMP-2026-0001/evidence.jpg'
      )
      expect(uploadBytes).toHaveBeenCalledWith(
        expect.anything(),
        file,
        { contentType: 'image/jpeg' }
      )
      expect(getDownloadURL).toHaveBeenCalled()
      expect(result.downloadUrl).toBe('https://storage.googleapis.com/test-bucket/photo.jpg')
      expect(result.path).toBe('complaint-photos/CMP-2026-0001/evidence.jpg')
    })

    it('supports local dev fixture mode when VITE_MOCK_STORAGE is true', async () => {
      const origEnv = import.meta.env.VITE_MOCK_STORAGE
      try {
        import.meta.env.VITE_MOCK_STORAGE = 'true'
        const file = new File(['fake-pixel'], 'preview.png', { type: 'image/png' })
        const result = await uploadComplaintPhoto(file, 'CMP-2026-MOCK')
        expect(result.downloadUrl).toBeDefined()
        expect(result.path).toBe('complaint-photos/CMP-2026-MOCK/preview.png')
        expect(result.filename).toBe('preview.png')
      } finally {
        import.meta.env.VITE_MOCK_STORAGE = origEnv
      }
    })
  })

  describe('deleteStorageFile and deleteComplaintEvidence', () => {
    it('deletes storage object using reference path', async () => {
      const { ref, deleteObject } = await import('firebase/storage')
      const fakeStorage = {}

      const success = await deleteStorageFile('complaint-photos/issue-123/evidence.jpg', fakeStorage)
      expect(success).toBe(true)
      expect(ref).toHaveBeenCalledWith(fakeStorage, 'complaint-photos/issue-123/evidence.jpg')
      expect(deleteObject).toHaveBeenCalled()
    })

    it('returns false gracefully when path is empty or falsy', async () => {
      expect(await deleteStorageFile('')).toBe(false)
      expect(await deleteStorageFile(null)).toBe(false)
      expect(await deleteStorageFile(undefined)).toBe(false)
    })

    it('catches deleteObject rejection gracefully without throwing', async () => {
      const { deleteObject } = await import('firebase/storage')
      deleteObject.mockRejectedValueOnce(new Error('Storage object not found'))

      const success = await deleteStorageFile('complaint-photos/issue-123/missing.jpg', {})
      expect(success).toBe(false)
    })

    it('cleans up multiple uploaded evidence files concurrently', async () => {
      const { ref, deleteObject } = await import('firebase/storage')
      const fakeStorage = {}

      const results = await deleteComplaintEvidence(
        [
          'complaint-photos/issue-123/photo.jpg',
          { path: 'complaint-audio/issue-123/audio.webm' },
        ],
        fakeStorage
      )

      expect(results).toHaveLength(2)
      expect(ref).toHaveBeenCalledWith(fakeStorage, 'complaint-photos/issue-123/photo.jpg')
      expect(ref).toHaveBeenCalledWith(fakeStorage, 'complaint-audio/issue-123/audio.webm')
      expect(deleteObject).toHaveBeenCalledTimes(2)
    })

    it('handles empty or non-array inputs to deleteComplaintEvidence safely', async () => {
      expect(await deleteComplaintEvidence([])).toEqual([])
      expect(await deleteComplaintEvidence(null)).toEqual([])
      expect(await deleteComplaintEvidence(undefined)).toEqual([])
    })
  })
})
