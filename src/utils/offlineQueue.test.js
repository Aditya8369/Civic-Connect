import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizePhotoFile,
  normalizeAudioBlob,
  saveOfflineComplaint,
  getPendingComplaints,
  removeOfflineComplaint,
  getPendingComplaintCount,
  markComplaintSyncing,
  markComplaintPending,
  resetStaleSyncingComplaints,
} from './offlineQueue'

describe('offlineQueue photo evidence preservation (Issue #145)', () => {
  let mockStore = new Map()

  beforeEach(() => {
    mockStore = new Map()

    const mockIDBStore = {
      add: vi.fn(record => {
        mockStore.set(record.localId, record)
      }),
      get: vi.fn(localId => {
        const record = mockStore.get(localId)
        const req = { result: record ? { ...record } : undefined }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      }),
      put: vi.fn(record => {
        mockStore.set(record.localId, record)
      }),
      getAll: vi.fn(() => {
        const req = { result: Array.from(mockStore.values()) }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      }),
      delete: vi.fn(localId => {
        mockStore.delete(localId)
      }),
    }

    const mockIDBTransaction = {
      objectStore: vi.fn(() => mockIDBStore),
      oncomplete: null,
      onerror: null,
      onabort: null,
    }

    const mockDB = {
      transaction: vi.fn(() => {
        const tx = { ...mockIDBTransaction }
        setTimeout(() => tx.oncomplete?.(), 10)
        return tx
      }),
      close: vi.fn(),
      objectStoreNames: { contains: vi.fn(() => true) },
    }

    const mockIDBFactory = {
      open: vi.fn(() => {
        const req = { result: mockDB }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      }),
    }

    vi.stubGlobal('window', { indexedDB: mockIDBFactory })
    vi.stubGlobal('indexedDB', mockIDBFactory)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('preserves photoFile, photoName, and photoType in saved offline records', async () => {
    const photo = new File(['image-bytes'], 'broken-sidewalk.png', { type: 'image/png' })
    const complaint = {
      title: 'Broken sidewalk',
      description: 'Trip hazard',
      category: 'Roads',
      address: 'Main St',
      userId: 'user-42',
      photoFile: photo,
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.localId).toBeDefined()
    expect(saved.syncStatus).toBe('pending')
    expect(saved.photoFile).toBe(photo)
    expect(saved.photoName).toBe('broken-sidewalk.png')
    expect(saved.photoType).toBe('image/png')

    const pending = await getPendingComplaints('user-42')
    expect(pending).toHaveLength(1)
    expect(pending[0].photoFile).toBe(photo)
    expect(pending[0].photoName).toBe('broken-sidewalk.png')

    const count = await getPendingComplaintCount('user-42')
    expect(count).toBe(1)

    await removeOfflineComplaint(saved.localId)
    const remaining = await getPendingComplaints('user-42')
    expect(remaining).toHaveLength(0)
  })

  it('normalizes a File object correctly', () => {
    const file = new File(['bytes'], 'evidence.jpg', { type: 'image/jpeg' })
    const normalized = normalizePhotoFile({ photoFile: file })
    expect(normalized).toBe(file)
    expect(normalized.name).toBe('evidence.jpg')
    expect(normalized.type).toBe('image/jpeg')
  })

  it('reconstructs a File from a Blob and metadata if photoFile lost its name', () => {
    const blob = new Blob(['bytes'], { type: 'image/png' })
    const normalized = normalizePhotoFile({
      photoFile: blob,
      photoName: 'reconstructed.png',
      photoType: 'image/png',
    })
    expect(normalized.name).toBe('reconstructed.png')
    expect(normalized.type).toBe('image/png')
  })

  it('returns null if no photo is attached to the complaint', () => {
    expect(normalizePhotoFile({ title: 'Just text' })).toBeNull()
    expect(normalizePhotoFile(null)).toBeNull()
    expect(normalizePhotoFile(undefined)).toBeNull()
  })

  it('marks complaints as syncing and updates syncAttemptAt', async () => {
    const saved = await saveOfflineComplaint({ title: 'Street light broken', userId: 'user-1' })
    expect(saved.syncStatus).toBe('pending')

    await markComplaintSyncing(saved.localId)
    const updated = mockStore.get(saved.localId)
    expect(updated.syncStatus).toBe('syncing')
    expect(updated.syncAttemptAt).toBeDefined()

    // While syncing, it should not appear in fresh getPendingComplaints
    const pending = await getPendingComplaints('user-1')
    expect(pending).toHaveLength(0)

    // Mark back to pending on sync failure
    await markComplaintPending(saved.localId)
    const reverted = mockStore.get(saved.localId)
    expect(reverted.syncStatus).toBe('pending')

    const pendingAgain = await getPendingComplaints('user-1')
    expect(pendingAgain).toHaveLength(1)
  })

  it('resets stale syncing complaints if a previous tab crashed mid-sync', async () => {
    const saved = await saveOfflineComplaint({ title: 'Flooded road', userId: 'user-2' })
    // Simulate complaint stuck in syncing with attempt timestamp from 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    mockStore.set(saved.localId, {
      ...saved,
      syncStatus: 'syncing',
      syncAttemptAt: fiveMinutesAgo,
    })

    const resetCount = await resetStaleSyncingComplaints('user-2', 60000)
    expect(resetCount).toBe(1)
    expect(mockStore.get(saved.localId).syncStatus).toBe('pending')
  })

  it('preserves audioBlob, audioDuration, and audioMimeType in saved offline records', async () => {
    const audioBlob = new Blob(['sample-audio-bytes'], { type: 'audio/webm' })
    const complaint = {
      title: 'Water leak',
      description: 'Loud gushing sound',
      category: 'Water',
      address: 'Park Avenue',
      userId: 'user-99',
      audioBlob,
      audioDuration: 12,
      audioMimeType: 'audio/webm',
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.localId).toBeDefined()
    expect(saved.syncStatus).toBe('pending')
    expect(saved.audioBlob).toBe(audioBlob)
    expect(saved.audioDuration).toBe(12)
    expect(saved.audioMimeType).toBe('audio/webm')

    const pending = await getPendingComplaints('user-99')
    expect(pending).toHaveLength(1)
    expect(pending[0].audioBlob).toBe(audioBlob)
    expect(pending[0].audioDuration).toBe(12)
    expect(pending[0].audioMimeType).toBe('audio/webm')
  })

  it('normalizes an audio Blob instance correctly with preserved MIME type', () => {
    const audioBlob = new Blob(['voice-note-audio'], { type: 'audio/webm' })
    const normalized = normalizeAudioBlob({ audioBlob, audioMimeType: 'audio/webm' })
    expect(normalized).toBeDefined()
    expect(normalized.type).toBe('audio/webm')
    expect(normalized.size).toBe(audioBlob.size)
  })

  it('normalizes audio from alternative property names such as voiceNote.blob', () => {
    const rawBlob = new Blob(['alternative-voice-note'], { type: 'audio/mp4' })
    const normalized = normalizeAudioBlob({
      voiceNote: { blob: rawBlob, contentType: 'audio/mp4', durationSeconds: 5 },
    })
    expect(normalized).toBeDefined()
    expect(normalized.type).toBe('audio/mp4')
  })

  it('handles complaints without audio and legacy records gracefully', () => {
    expect(normalizeAudioBlob({ title: 'Just text' })).toBeNull()
    expect(normalizeAudioBlob(null)).toBeNull()
    expect(normalizeAudioBlob(undefined)).toBeNull()
    expect(normalizeAudioBlob({ audioBlob: null })).toBeNull()
  })

  it('preserves both photoFile and audioBlob in the same offline complaint', async () => {
    const photo = new File(['photo-data'], 'hazard.jpg', { type: 'image/jpeg' })
    const audio = new Blob(['audio-data'], { type: 'audio/ogg' })

    const complaint = {
      title: 'Pothole with audio narration',
      description: 'Recorded while walking past',
      category: 'Roads',
      address: 'Market St',
      userId: 'user-dual',
      photoFile: photo,
      audioBlob: audio,
      audioDuration: 8,
      audioMimeType: 'audio/ogg',
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.photoFile).toBe(photo)
    expect(saved.photoName).toBe('hazard.jpg')
    expect(saved.audioBlob).toBe(audio)
    expect(saved.audioDuration).toBe(8)
    expect(saved.audioMimeType).toBe('audio/ogg')

    const normalizedPhoto = normalizePhotoFile(saved)
    const normalizedAudio = normalizeAudioBlob(saved)

    expect(normalizedPhoto.name).toBe('hazard.jpg')
    expect(normalizedAudio.type).toBe('audio/ogg')
  })
})
