import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizePhotoFile,
  saveOfflineComplaint,
  getPendingComplaints,
  removeOfflineComplaint,
  getPendingComplaintCount,
  updateOfflineComplaintStatus,
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
})
