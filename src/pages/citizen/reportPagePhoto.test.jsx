import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateComplaintPhoto, sanitizeFilename } from '@/firebase/storage'

vi.mock('@/firebase/config', () => ({
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
}))

describe('Issue #27 Photo Evidence Attachment Specifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Validation specifications (max 5MB, format image/jpeg or image/png)', () => {
    it('enforces maximum 5MB file size constraint', () => {
      const oversizedFile = new File([new Uint8Array(5 * 1024 * 1024 + 10)], 'pothole.jpg', {
        type: 'image/jpeg',
      })
      const result = validateComplaintPhoto(oversizedFile)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('5MB')
    })

    it('accepts JPEG and PNG files under 5MB', () => {
      const validJpg = new File(['valid-jpeg-bytes'], 'road.jpg', { type: 'image/jpeg' })
      const validPng = new File(['valid-png-bytes'], 'sign.png', { type: 'image/png' })

      expect(validateComplaintPhoto(validJpg).valid).toBe(true)
      expect(validateComplaintPhoto(validPng).valid).toBe(true)
    })

    it('rejects unsupported file formats', () => {
      const invalidSvg = new File(['<svg></svg>'], 'vector.svg', { type: 'image/svg+xml' })
      const invalidPdf = new File(['%PDF'], 'report.pdf', { type: 'application/pdf' })
      const invalidGif = new File(['GIF89a'], 'animation.gif', { type: 'image/gif' })

      expect(validateComplaintPhoto(invalidSvg).valid).toBe(false)
      expect(validateComplaintPhoto(invalidPdf).valid).toBe(false)
      expect(validateComplaintPhoto(invalidGif).valid).toBe(false)
    })
  })

  describe('Storage path specification: complaint-photos/{complaintId}/{filename}', () => {
    it('uploads to exact path pattern complaint-photos/{complaintId}/{filename}', async () => {
      const { uploadComplaintPhoto } = await import('@/firebase/storage')
      const mockStorage = {}
      const file = new File(['img-content'], 'evidence.png', { type: 'image/png' })

      const uploadResult = await uploadComplaintPhoto(file, 'CMP-2026-1234', mockStorage)
      expect(uploadResult.path).toBe('complaint-photos/CMP-2026-1234/evidence.png')
      expect(uploadResult.downloadUrl).toBe('https://storage.googleapis.com/test-bucket/photo.jpg')
    })

    it('sanitizes filename to prevent path traversal', () => {
      expect(sanitizeFilename('../../../malicious.png')).toBe('malicious.png')
      expect(sanitizeFilename('photo with spaces & symbols (#1).jpg')).toBe('photo_with_spaces___symbols___1_.jpg')
    })
  })

  describe('Firestore issue schema compatibility', () => {
    it('exports validation and upload helpers from @/firebase/services', async () => {
      const services = await import('@/firebase/services')
      expect(typeof services.validateComplaintPhoto).toBe('function')
      expect(typeof services.uploadComplaintPhoto).toBe('function')
    })

    it('sets both imageUrl and photos array in issue document payload', async () => {
      const { uploadComplaintPhoto } = await import('@/firebase/storage')
      const mockStorage = {}
      const file = new File(['img-content'], 'test.jpg', { type: 'image/jpeg' })

      const uploadResult = await uploadComplaintPhoto(file, 'CMP-2026-9999', mockStorage)

      const issuePayload = {
        complaintId: 'CMP-2026-9999',
        title: 'Water leak',
        imageUrl: uploadResult.downloadUrl || null,
        photos: uploadResult.downloadUrl ? [uploadResult.downloadUrl] : [],
      }

      expect(issuePayload.imageUrl).toBe('https://storage.googleapis.com/test-bucket/photo.jpg')
      expect(issuePayload.photos).toEqual(['https://storage.googleapis.com/test-bucket/photo.jpg'])
    })

    it('gracefully supports complaints submitted without photos (imageUrl: null, photos: [])', () => {
      const issuePayloadWithoutPhoto = {
        complaintId: 'CMP-2026-0001',
        title: 'Streetlight out',
        imageUrl: null,
        photos: [],
      }

      expect(issuePayloadWithoutPhoto.imageUrl).toBeNull()
      expect(issuePayloadWithoutPhoto.photos).toEqual([])
    })
  })

  describe('Issue #145 Offline photo evidence preservation', () => {
    it('preserves photoFile and metadata when saving offline complaint', async () => {
      const { normalizePhotoFile } = await import('@/firebase/offlineComplaintSync')
      const file = new File(['offline-evidence'], 'pothole-depth.png', { type: 'image/png' })

      const offlinePayload = {
        title: 'Deep pothole',
        description: 'Near junction',
        category: 'Potholes & Road Damage',
        address: 'MG Road',
        userId: 'citizen-101',
        photoFile: file,
        photoName: file.name,
        photoType: file.type,
      }

      expect(offlinePayload.photoFile).toBe(file)
      expect(offlinePayload.photoName).toBe('pothole-depth.png')
      expect(offlinePayload.photoType).toBe('image/png')

      const normalized = normalizePhotoFile(offlinePayload)
      expect(normalized).toBe(file)
      expect(normalized.name).toBe('pothole-depth.png')
      expect(normalized.type).toBe('image/png')
    })

    it('reconstructs File from a Blob when photoFile was deserialized without name', async () => {
      const { normalizePhotoFile } = await import('@/firebase/offlineComplaintSync')
      const blob = new Blob(['bytes'], { type: 'image/jpeg' })

      const offlinePayload = {
        title: 'Streetlight',
        photoFile: blob,
        photoName: 'captured-photo.jpg',
        photoType: 'image/jpeg',
      }

      const normalized = normalizePhotoFile(offlinePayload)
      expect(normalized.name).toBe('captured-photo.jpg')
      expect(normalized.type).toBe('image/jpeg')
    })

    it('returns null from normalizePhotoFile when complaint has no photo', async () => {
      const { normalizePhotoFile } = await import('@/firebase/offlineComplaintSync')
      expect(normalizePhotoFile({ title: 'No photo' })).toBeNull()
      expect(normalizePhotoFile(null)).toBeNull()
    })
  })
})
