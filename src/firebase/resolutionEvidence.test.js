import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  uploadResolutionProof,
  uploadDisputePhoto,
  uploadDisputeAudio,
} from './storage'

const mocks = vi.hoisted(() => ({
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
  ref: vi.fn((storage, path) => ({ storage, path })),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  ref: mocks.ref,
  uploadBytes: mocks.uploadBytes,
  getDownloadURL: mocks.getDownloadURL,
  deleteObject: mocks.deleteObject,
}))

describe('Resolution and Dispute Evidence Storage (#253)', () => {
  const fakeStorage = {}

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.uploadBytes.mockResolvedValue({})
    mocks.getDownloadURL.mockResolvedValue('https://firebasestorage.googleapis.com/download/test-url')
  })

  describe('uploadResolutionProof', () => {
    it('uploads resolution proof to complaint-resolution-proof/{complaintId}/{filename}', async () => {
      const file = new File(['proof-bytes'], 'repaired-pipe.jpg', { type: 'image/jpeg' })
      const res = await uploadResolutionProof(file, 'CMP-2026-0001', fakeStorage)

      expect(res.downloadUrl).toBe('https://firebasestorage.googleapis.com/download/test-url')
      expect(res.path).toBe('complaint-resolution-proof/CMP-2026-0001/repaired-pipe.jpg')
      expect(res.contentType).toBe('image/jpeg')
      expect(mocks.uploadBytes).toHaveBeenCalledWith(
        expect.objectContaining({ path: res.path }),
        file,
        { contentType: 'image/jpeg' }
      )
    })

    it('rejects upload without valid complaint ID', async () => {
      const file = new File(['proof-bytes'], 'test.png', { type: 'image/png' })
      await expect(uploadResolutionProof(file, '', fakeStorage)).rejects.toThrow('complaint ID is required')
    })

    it('rejects oversized files exceeding 5MB limit', async () => {
      const hugeFile = new File([new Uint8Array(6 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
      await expect(uploadResolutionProof(hugeFile, 'CMP-2026-0001', fakeStorage)).rejects.toThrow('5MB limit')
    })

    it('rejects invalid non-image MIME types', async () => {
      const textFile = new File(['hello'], 'document.pdf', { type: 'application/pdf' })
      await expect(uploadResolutionProof(textFile, 'CMP-2026-0001', fakeStorage)).rejects.toThrow('Only JPG and PNG')
    })
  })

  describe('uploadDisputePhoto', () => {
    it('uploads citizen dispute photo to complaint-disputes/{complaintId}/{filename}', async () => {
      const file = new File(['dispute-bytes'], 'broken-again.png', { type: 'image/png' })
      const res = await uploadDisputePhoto(file, 'CMP-2026-0001', fakeStorage)

      expect(res.downloadUrl).toBe('https://firebasestorage.googleapis.com/download/test-url')
      expect(res.path).toBe('complaint-disputes/CMP-2026-0001/broken-again.png')
      expect(res.contentType).toBe('image/png')
      expect(mocks.uploadBytes).toHaveBeenCalledWith(
        expect.objectContaining({ path: res.path }),
        file,
        { contentType: 'image/png' }
      )
    })

    it('rejects dispute photo without complaint ID', async () => {
      const file = new File(['bytes'], 'test.jpg', { type: 'image/jpeg' })
      await expect(uploadDisputePhoto(file, '', fakeStorage)).rejects.toThrow('complaint ID is required')
    })
  })

  describe('uploadDisputeAudio', () => {
    it('uploads citizen dispute voice recording to complaint-disputes/{complaintId}/{filename}', async () => {
      const audioBlob = new Blob(['audio-data'], { type: 'audio/webm' })
      const res = await uploadDisputeAudio(audioBlob, 'CMP-2026-0001', 15, fakeStorage)

      expect(res.downloadUrl).toBe('https://firebasestorage.googleapis.com/download/test-url')
      expect(res.path).toMatch(/^complaint-disputes\/CMP-2026-0001\/dispute-voice-\d+\.webm$/)
      expect(res.durationSeconds).toBe(15)
      expect(res.contentType).toBe('audio/webm')
      expect(mocks.uploadBytes).toHaveBeenCalledWith(
        expect.objectContaining({ path: res.path }),
        audioBlob,
        { contentType: 'audio/webm' }
      )
    })

    it('rejects audio notes exceeding 60-second limit', async () => {
      const audioBlob = new Blob(['audio-data'], { type: 'audio/webm' })
      await expect(uploadDisputeAudio(audioBlob, 'CMP-2026-0001', 65, fakeStorage)).rejects.toThrow('60 seconds')
    })
  })
})
