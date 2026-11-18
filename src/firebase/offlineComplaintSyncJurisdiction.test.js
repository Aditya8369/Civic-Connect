import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  saveOfflineComplaint,
  getPendingComplaints,
} from '@/utils/offlineQueue'
import { syncOfflineComplaint } from '@/firebase/offlineComplaintSync'
import { auth } from '@/firebase/services'

vi.mock('@/firebase/config', () => ({
  default: {
    apiKey: 'mock-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'demo-test',
  },
}))

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  connectAuthEmulator: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(() => ({})),
  connectStorageEmulator: vi.fn(),
}))

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(() => ({})),
    connectFirestoreEmulator: vi.fn(),
    collection: vi.fn((_db, name) => ({ _col: name })),
    doc: vi.fn((_db, name, id) => ({ _col: name, id })),
    documentId: vi.fn(() => 'documentId'),
    query: vi.fn(() => ({})),
    where: vi.fn(),
    orderBy: vi.fn(),
    startAt: vi.fn(),
    limit: vi.fn(),
    serverTimestamp: vi.fn(() => ({ _methodName: 'serverTimestamp' })),
    runTransaction: vi.fn(),
    getDocFromServer: vi.fn(),
    getDocsFromServer: vi.fn(() => Promise.resolve({ docs: [] })),
  }
})

describe('Offline Queue & Sync Jurisdiction Routing Integration (Issue #251)', () => {
  let mockStore = new Map()

  beforeEach(() => {
    mockStore = new Map()

    const mockIDBStore = {
      add: vi.fn((record) => {
        mockStore.set(record.localId, record)
      }),
      get: vi.fn((localId) => {
        const record = mockStore.get(localId)
        const req = { result: record ? { ...record } : undefined }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      }),
      put: vi.fn((record) => {
        mockStore.set(record.localId, record)
      }),
      getAll: vi.fn(() => {
        const req = { result: Array.from(mockStore.values()) }
        setTimeout(() => req.onsuccess?.(), 0)
        return req
      }),
      delete: vi.fn((localId) => {
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

  it('automatically resolves and preserves wardId, zoneName, and jurisdictionMeta upon saveOfflineComplaint', async () => {
    // In Connaught Place: WARD-01
    const complaint = {
      title: 'Pothole near Connaught Place',
      description: 'Dangerous road hole',
      category: 'Potholes & Road Damage',
      address: 'Connaught Circle',
      latitude: 28.616,
      longitude: 77.209,
      userId: 'user-77',
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.localId).toBeDefined()
    expect(saved.wardId).toBe('WARD-01')
    expect(saved.zoneName).toBe('New Delhi Central Zone (Zone A)')
    expect(saved.jurisdictionMeta).toBeDefined()
    expect(saved.jurisdictionMeta.wardName).toBe('Central Civic Core & Connaught Ward')

    const pending = await getPendingComplaints('user-77')
    expect(pending).toHaveLength(1)
    expect(pending[0].wardId).toBe('WARD-01')
    expect(pending[0].zoneName).toBe('New Delhi Central Zone (Zone A)')
  })

  it('preserves pre-resolved ward metadata if already passed into saveOfflineComplaint', async () => {
    const customMeta = {
      wardId: 'WARD-02',
      wardName: 'India Gate & Pragati Heritage Ward',
      zoneName: 'East Civic Heritage Zone (Zone B)',
    }
    const complaint = {
      title: 'Heritage sign damaged',
      description: 'Sign falling down',
      category: 'Other',
      address: 'Rajpath',
      latitude: 28.616,
      longitude: 77.224,
      userId: 'user-77',
      wardId: 'WARD-02',
      zoneName: 'East Civic Heritage Zone (Zone B)',
      jurisdictionMeta: customMeta,
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.wardId).toBe('WARD-02')
    expect(saved.zoneName).toBe('East Civic Heritage Zone (Zone B)')
    expect(saved.jurisdictionMeta).toEqual(customMeta)
  })

  it('handles out-of-boundary offline complaints gracefully without failing', async () => {
    const complaint = {
      title: 'Boundary unknown location',
      description: 'Outside city limits',
      category: 'Other',
      address: 'Far highway',
      latitude: 12.9716, // Bangalore
      longitude: 77.5946,
      userId: 'user-88',
    }

    const saved = await saveOfflineComplaint(complaint)
    expect(saved.wardId).toBeNull()
    expect(saved.zoneName).toBeNull()
    expect(saved.localId).toBeDefined()

    const pending = await getPendingComplaints('user-88')
    expect(pending).toHaveLength(1)
    expect(pending[0].title).toBe('Boundary unknown location')
  })

  it('handles legacy offline queue entries without jurisdiction fields gracefully', async () => {
    const legacyComplaint = {
      localId: 'legacy-1',
      title: 'Old offline complaint',
      description: 'Filed before jurisdiction update',
      userId: 'user-99',
      latitude: 28.616,
      longitude: 77.209,
      syncStatus: 'pending',
    }

    // Direct insert to mock store
    mockStore.set(legacyComplaint.localId, legacyComplaint)

    const pending = await getPendingComplaints('user-99')
    expect(pending).toHaveLength(1)
    expect(pending[0].localId).toBe('legacy-1')
    expect(pending[0].wardId).toBeUndefined()
  })

  it('syncOfflineComplaint attaches verified wardId, ward, and zoneName to the Firestore document', async () => {
    const { runTransaction } = await import('firebase/firestore')

    let writtenDocData = null
    const mockTx = {
      get: vi.fn(() => Promise.resolve({ exists: () => false })),
      set: vi.fn((ref, data) => {
        if (data && data.complaintId && data.category) {
          writtenDocData = { ...data }
        }
      }),
    }

    runTransaction.mockImplementation(async (_db, fn) => {
      return fn(mockTx)
    })

    const session = { uid: 'user-77' }
    auth.currentUser = session

    const complaintToSync = {
      localId: 'local-test-123',
      userId: 'user-77',
      title: 'Synced issue',
      description: 'Syncing to Firestore',
      category: 'Roads',
      address: 'Connaught Circle',
      latitude: 28.616,
      longitude: 77.209,
    }

    try {
      await syncOfflineComplaint(complaintToSync, session, {
        uploadPhoto: vi.fn(),
        uploadAudio: vi.fn(),
        deleteEvidence: vi.fn(),
      })
    } catch (e) {
      console.error('sync error in test:', e)
    }

    expect(writtenDocData).not.toBeNull()
    expect(writtenDocData.wardId).toBe('WARD-01')
    expect(writtenDocData.ward).toBe('WARD-01')
    expect(writtenDocData.zoneName).toBe('New Delhi Central Zone (Zone A)')
    expect(writtenDocData.status).toBe('Pending')
  })
})
