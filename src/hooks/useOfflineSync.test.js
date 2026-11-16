import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useOfflineSync } from './useOfflineSync'
import { createTransactionStore } from '@/firebase/testSupport/transactionStore'

const runtime = vi.hoisted(() => ({
  auth: { currentUser: null },
  store: null,
  pending: null,
  id: 0,
  cleanupError: null,
  uploadError: null,
  uploadCalls: [],
  audioUploadError: null,
  audioUploadCalls: [],
  evidenceCleanupError: null,
  cleanupCalls: [],
}))
vi.mock('react', () => ({ useCallback: callback => callback, useEffect() {}, useRef: current => ({ current }) }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: runtime.auth.currentUser }) }))
vi.mock('@/firebase/services', () => ({ db: {}, auth: runtime.auth }))
vi.mock('@/firebase/storage', () => ({
  uploadComplaintPhoto: vi.fn(async (file, id) => {
    runtime.uploadCalls.push({ file, id })
    if (runtime.uploadError) throw runtime.uploadError
    const filename = file.name || 'photo.jpg'
    return {
      downloadUrl: `https://storage.googleapis.com/test-bucket/${id}/${filename}`,
      path: `complaint-photos/${id}/${filename}`,
      filename,
    }
  }),
  uploadComplaintAudio: vi.fn(async (blob, id, duration) => {
    runtime.audioUploadCalls.push({ blob, id, duration })
    if (runtime.audioUploadError) throw runtime.audioUploadError
    const ext = blob.type?.includes('ogg') ? 'ogg' : 'webm'
    const filename = `voice-note-${id}.${ext}`
    return {
      downloadUrl: `https://storage.googleapis.com/test-bucket/${id}/${filename}`,
      path: `complaint-audio/${id}/${filename}`,
      filename,
      durationSeconds: duration,
      contentType: blob.type || 'audio/webm',
    }
  }),
  deleteComplaintEvidence: vi.fn(async (uploads = []) => {
    runtime.cleanupCalls.push(...uploads)
    if (runtime.evidenceCleanupError) throw runtime.evidenceCleanupError
    return uploads.map(() => ({ status: 'fulfilled', value: true }))
  }),
}))
vi.mock('@/utils/offlineQueue', () => ({
  getPendingComplaints: async uid => structuredClone([...runtime.pending.values()].filter(item => item.userId === uid)),
  removeOfflineComplaint: async id => {
    if (runtime.cleanupError) throw runtime.cleanupError
    runtime.pending.delete(id)
  },
  markComplaintSyncing: async () => true,
  markComplaintPending: async () => true,
}))
vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => parts.length ? parts.join('/') : `${ref}/${++runtime.id}`,
  collection: (_db, name) => name,
  documentId: () => '__name__',
  orderBy: () => [],
  startAt: value => ['startAt', value],
  limit: () => [],
  where: (field, _op, value) => [field, value],
  query: (name, ...filters) => ({ name, filters: Object.fromEntries(filters) }),
  getDocsFromServer: async ({ name, filters }) => ({
    docs: runtime.store.read(`${name}/${filters.startAt}`)?.reportedBy === filters.reportedBy
      ? [{ id: filters.startAt }] : [],
  }),
  getDocFromServer: async key => ({ exists: () => runtime.store.read(key) !== undefined }),
  runTransaction: (...args) => runtime.store.runTransaction(...args),
  serverTimestamp: () => 'server-time',
}))

const entry = { localId: 'queued-1', userId: 'citizen-1', title: 'Lamp', description: 'Out', category: 'Lights', address: 'Market Road' }
const issue = `issues/${entry.localId}`
const receipt = `users/${entry.userId}/offlineComplaintReceipts/${entry.localId}`
const counter = 'counters/issueCounter'
const eventCount = () => runtime.store.history.filter(({ key }) => key.startsWith(`${issue}/events/`)).length
const notices = () => runtime.store.history.filter(({ key }) => key.startsWith('notifications/')).map(({ data }) => data)

beforeEach(() => {
  vi.stubGlobal('navigator', { onLine: true })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  runtime.auth.currentUser = { uid: entry.userId }
  runtime.store = createTransactionStore()
  runtime.pending = new Map([[entry.localId, entry]])
  runtime.cleanupError = null
  runtime.uploadError = null
  runtime.uploadCalls = []
  runtime.audioUploadError = null
  runtime.audioUploadCalls = []
  runtime.evidenceCleanupError = null
  runtime.cleanupCalls = []
  runtime.id = 0
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('uploads and attaches photo evidence when syncing an offline complaint with a photo', async () => {
  const photoFile = new File(['png-bytes'], 'broken-pipe.png', { type: 'image/png' })
  const photoEntry = { ...entry, photoFile, photoName: 'broken-pipe.png', photoType: 'image/png' }
  runtime.pending = new Map([[entry.localId, photoEntry]])

  await useOfflineSync().syncComplaints()

  const saved = runtime.store.read(issue)
  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.uploadCalls[0].id).toBe(entry.localId)
  expect(runtime.uploadCalls[0].file.name).toBe('broken-pipe.png')

  expect(saved).toMatchObject({
    title: 'Lamp',
    reportedBy: entry.userId,
    status: 'Pending',
    imageUrl: `https://storage.googleapis.com/test-bucket/${entry.localId}/broken-pipe.png`,
    photos: [
      {
        downloadUrl: `https://storage.googleapis.com/test-bucket/${entry.localId}/broken-pipe.png`,
        path: `complaint-photos/${entry.localId}/broken-pipe.png`,
        filename: 'broken-pipe.png',
      },
    ],
  })
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(runtime.store.read(receipt)).toEqual({ createdAt: 'server-time' })
  expect(runtime.pending.size).toBe(0)
})

it('retains the queued complaint and does not commit writes when photo upload fails', async () => {
  const photoFile = new File(['png-bytes'], 'hazard.png', { type: 'image/png' })
  const photoEntry = { ...entry, photoFile, photoName: 'hazard.png', photoType: 'image/png' }
  runtime.pending = new Map([[entry.localId, photoEntry]])
  runtime.uploadError = new Error('Network error uploading photo to Storage')

  await useOfflineSync().syncComplaints()

  expect(runtime.store.history).toEqual([])
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.store.read(counter)).toBeUndefined()
  expect(runtime.store.read(receipt)).toBeUndefined()
  expect(runtime.pending.size).toBe(1)
  expect(runtime.pending.get(entry.localId).photoFile).toBe(photoFile)
})

it('retains photo evidence in queue if transaction commit fails after successful photo upload', async () => {
  const photoFile = new File(['png-bytes'], 'drainage.png', { type: 'image/png' })
  const photoEntry = { ...entry, photoFile, photoName: 'drainage.png', photoType: 'image/png' }
  runtime.pending = new Map([[entry.localId, photoEntry]])
  runtime.store.failCommit = Object.assign(new Error('unavailable'), { code: 'unavailable' })

  await useOfflineSync().syncComplaints()

  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.store.history).toEqual([])
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.pending.size).toBe(1)
  expect(runtime.pending.get(entry.localId).photoFile).toBe(photoFile)

  // Retry succeeds
  runtime.store.failCommit = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toBeDefined()
  expect(runtime.store.read(issue).imageUrl).toContain('drainage.png')
  expect(runtime.pending.size).toBe(0)
})

it('normalizes photo evidence from a Blob with preserved photo metadata', async () => {
  const rawBlob = new Blob(['bytes'], { type: 'image/jpeg' })
  const blobEntry = { ...entry, photoFile: rawBlob, photoName: 'camera-photo.jpg', photoType: 'image/jpeg' }
  runtime.pending = new Map([[entry.localId, blobEntry]])

  await useOfflineSync().syncComplaints()

  const saved = runtime.store.read(issue)
  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.uploadCalls[0].file.name).toBe('camera-photo.jpg')
  expect(saved.imageUrl).toBe(`https://storage.googleapis.com/test-bucket/${entry.localId}/camera-photo.jpg`)
  expect(saved.photos[0].filename).toBe('camera-photo.jpg')
  expect(runtime.pending.size).toBe(0)
})

it('commits one complaint, ticket, event and notice when two tabs sync the same queue item', async () => {
  await Promise.all([useOfflineSync().syncComplaints(), useOfflineSync().syncComplaints()])
  const saved = runtime.store.read(issue)
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(saved).toMatchObject({ title: 'Lamp', reportedBy: entry.userId, status: 'Pending' })
  expect(eventCount()).toBe(1)
  expect(notices()).toEqual([expect.objectContaining({ issueId: saved.complaintId, type: 'new_complaint' })])
  expect(runtime.store.read(receipt)).toEqual({ createdAt: 'server-time' })
  expect(runtime.pending.size).toBe(0)
})

it('retries cleanup after a committed upload without replacing edits or creating another ticket', async () => {
  runtime.cleanupError = new Error('IndexedDB cleanup failed')
  await useOfflineSync().syncComplaints()
  expect(runtime.pending.size).toBe(1)
  const edited = { ...runtime.store.read(issue), title: 'Edited online', department: 'Electricity' }
  runtime.store.write(issue, edited)
  const writes = runtime.store.history.length

  runtime.cleanupError = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toEqual(edited)
  expect(runtime.store.history).toHaveLength(writes)
  expect(runtime.pending.size).toBe(0)
})

it('does not recreate a complaint deleted after an upload with failed cleanup', async () => {
  runtime.cleanupError = new Error('IndexedDB cleanup failed')
  await useOfflineSync().syncComplaints()
  runtime.store.remove(issue)
  runtime.cleanupError = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(runtime.pending.size).toBe(0)
})

it('records an earlier upload without touching its fields, counter, event history or notices', async () => {
  const legacy = { reportedBy: entry.userId, complaintId: 'CMP-2026-0042', status: 'Resolved', title: 'Updated online' }
  runtime.store = createTransactionStore({ [issue]: legacy })
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(issue)).toEqual(legacy)
  expect(runtime.store.history).toEqual([{ key: receipt, data: { createdAt: 'server-time' } }])
  expect(runtime.pending.size).toBe(0)
})

it.each(['unavailable', 'permission-denied'])('retains the queue item and rolls back all writes on %s', async code => {
  runtime.store.failCommit = Object.assign(new Error(code), { code })
  await useOfflineSync().syncComplaints()
  expect(runtime.store.history).toEqual([])
  expect(runtime.pending.size).toBe(1)
  runtime.store.failCommit = null
  await useOfflineSync().syncComplaints()
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(eventCount()).toBe(1)
  expect(notices()).toHaveLength(1)
  expect(runtime.pending.size).toBe(0)
})

it('preserves the queue item if the sign-in session changes before a transaction retry', async () => {
  runtime.store.beforeCommit = () => {
    runtime.store.write(counter, { lastNumber: 10 })
    runtime.auth.currentUser = { uid: entry.userId }
  }
  await useOfflineSync().syncComplaints()
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read(issue)).toBeUndefined()
  expect(runtime.store.read(receipt)).toBeUndefined()
  expect(runtime.pending.size).toBe(1)
})

it('uses Web Locks to prevent redundant multi-tab storage uploads and concurrent sync runs', async () => {
  let activeLock = false
  const requestMock = vi.fn(async (lockName, options, callback) => {
    if (activeLock) {
      // Simulate Web Locks { ifAvailable: true } returning null when lock is held by another tab
      return await callback(null)
    }
    activeLock = true
    try {
      return await callback({ name: lockName })
    } finally {
      activeLock = false
    }
  })

  vi.stubGlobal('navigator', {
    onLine: true,
    locks: { request: requestMock },
  })

  const photoFile = new File(['png-bytes'], 'concurrent-proof.png', { type: 'image/png' })
  const photoEntry = { ...entry, photoFile, photoName: 'concurrent-proof.png', photoType: 'image/png' }
  runtime.pending = new Map([[entry.localId, photoEntry]])

  // Tab 1 and Tab 2 trigger sync concurrently upon network restoration
  const tab1 = useOfflineSync()
  const tab2 = useOfflineSync()

  await Promise.all([tab1.syncComplaints(), tab2.syncComplaints()])

  // Exactly one upload occurred, executed by the leader tab that acquired the lock
  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.uploadCalls[0].file.name).toBe('concurrent-proof.png')
  expect(runtime.store.read(counter)).toEqual({ lastNumber: 1 })
  expect(runtime.pending.size).toBe(0)
})

it('uploads and attaches voice-note audio evidence during offline synchronization', async () => {
  const audioBlob = new Blob(['voice-note-data'], { type: 'audio/webm' })
  const audioEntry = {
    ...entry,
    audioBlob,
    audioDuration: 15,
    audioMimeType: 'audio/webm',
  }
  runtime.pending = new Map([[entry.localId, audioEntry]])

  await useOfflineSync().syncComplaints()

  const saved = runtime.store.read(issue)
  expect(runtime.audioUploadCalls).toHaveLength(1)
  expect(runtime.audioUploadCalls[0].id).toBe(entry.localId)
  expect(runtime.audioUploadCalls[0].duration).toBe(15)

  expect(saved).toMatchObject({
    title: 'Lamp',
    reportedBy: entry.userId,
    status: 'Pending',
    audioNote: {
      url: `https://storage.googleapis.com/test-bucket/${entry.localId}/voice-note-${entry.localId}.webm`,
      path: `complaint-audio/${entry.localId}/voice-note-${entry.localId}.webm`,
      filename: `voice-note-${entry.localId}.webm`,
      durationSeconds: 15,
      contentType: 'audio/webm',
    },
  })
  expect(runtime.store.read(receipt)).toEqual({ createdAt: 'server-time' })
  expect(runtime.pending.size).toBe(0)
})

it('uploads both photo and audio evidence concurrently for a dual-evidence offline complaint', async () => {
  const photoFile = new File(['png-bytes'], 'broken-light.png', { type: 'image/png' })
  const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' })
  const dualEntry = {
    ...entry,
    photoFile,
    photoName: 'broken-light.png',
    photoType: 'image/png',
    audioBlob,
    audioDuration: 22,
    audioMimeType: 'audio/webm',
  }
  runtime.pending = new Map([[entry.localId, dualEntry]])

  await useOfflineSync().syncComplaints()

  const saved = runtime.store.read(issue)
  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.audioUploadCalls).toHaveLength(1)
  expect(saved.imageUrl).toBe(`https://storage.googleapis.com/test-bucket/${entry.localId}/broken-light.png`)
  expect(saved.photos).toHaveLength(1)
  expect(saved.audioNote).toMatchObject({
    filename: `voice-note-${entry.localId}.webm`,
    durationSeconds: 22,
    contentType: 'audio/webm',
  })
  expect(runtime.pending.size).toBe(0)
})

it('cleans up uploaded audio and photo artifacts if Firestore transaction fails after upload', async () => {
  const photoFile = new File(['png-bytes'], 'hazard-photo.png', { type: 'image/png' })
  const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' })
  const dualEntry = {
    ...entry,
    photoFile,
    photoName: 'hazard-photo.png',
    photoType: 'image/png',
    audioBlob,
    audioDuration: 30,
    audioMimeType: 'audio/webm',
  }
  runtime.pending = new Map([[entry.localId, dualEntry]])
  runtime.store.failCommit = Object.assign(new Error('Commit failed'), { code: 'unavailable' })

  await useOfflineSync().syncComplaints()

  // Storage uploads occurred
  expect(runtime.uploadCalls).toHaveLength(1)
  expect(runtime.audioUploadCalls).toHaveLength(1)

  // Cleanup was invoked for both uploaded paths
  expect(runtime.cleanupCalls).toContain(`complaint-photos/${entry.localId}/hazard-photo.png`)
  expect(runtime.cleanupCalls).toContain(`complaint-audio/${entry.localId}/voice-note-${entry.localId}.webm`)

  // Queue item was retained with evidence intact
  expect(runtime.pending.size).toBe(1)
  expect(runtime.pending.get(entry.localId).audioBlob).toBe(audioBlob)
  expect(runtime.pending.get(entry.localId).photoFile).toBe(photoFile)
})

it('does not crash sync loop or hide transaction error if cleanup fails', async () => {
  const audioBlob = new Blob(['audio-bytes'], { type: 'audio/webm' })
  const audioEntry = {
    ...entry,
    audioBlob,
    audioDuration: 10,
    audioMimeType: 'audio/webm',
  }
  runtime.pending = new Map([[entry.localId, audioEntry]])
  runtime.store.failCommit = Object.assign(new Error('Transaction rejected'), { code: 'aborted' })
  runtime.evidenceCleanupError = new Error('Storage delete failed')

  // Sync handles cleanup failure gracefully without unhandled rejection
  await expect(useOfflineSync().syncComplaints()).resolves.toBeUndefined()
  expect(runtime.pending.size).toBe(1)
})

