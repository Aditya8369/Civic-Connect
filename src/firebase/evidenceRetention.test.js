import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  evaluateEvidenceRetentionEligibility,
  executeEvidenceRetentionCleanup,
  runRetentionCleanupSweep,
  applyRetentionHold,
  releaseRetentionHold,
  extractEvidencePathInfo,
  createEvidenceTombstone,
  DEFAULT_RETENTION_POLICY_VERSION,
  CLEANUP_INTENT_STATUS,
} from './evidenceRetention'
import { createTransactionStore } from './testSupport/transactionStore'

const backend = vi.hoisted(() => ({ store: null, allDocs: [] }))
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

let eventCounter = 0

vi.mock('firebase/firestore', () => ({
  doc: (...args) => {
    if (args.length === 1) {
      return `${args[0]}/event-${++eventCounter}`
    }
    const parts = args.slice(1)
    return parts.join('/')
  },
  collection: (_db, ...parts) => parts.join('/'),
  getDoc: async (path) => {
    const data = backend.store.read(path)
    return {
      id: path.split('/').pop(),
      exists: () => data !== undefined,
      data: () => data,
    }
  },
  query: (col) => col,
  where: () => ({}),
  limit: () => ({}),
  getDocs: async () => ({
    docs: backend.allDocs.map((item) => ({
      id: item.id,
      data: () => item.data,
    })),
  }),
  runTransaction: (...args) => backend.store.runTransaction(...args),
  serverTimestamp: () => 'SERVER_TIMESTAMP_MOCK',
  Timestamp: {
    fromMillis: (ms) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
      seconds: Math.floor(ms / 1000),
    }),
  },
}))

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ _path: path })),
  deleteObject: (...args) => deleteObjectMock(...args),
}))

vi.mock('./services', () => ({
  auth: { currentUser: null },
  db: {},
  storage: {},
}))

describe('Issue #283: Auditable Evidence Retention & Erasure Engine', () => {
  const adminUser = { uid: 'admin-1', email: 'admin@civic.gov', role: 'admin' }
  const ONE_DAY_MS = 24 * 60 * 60 * 1000
  const BASE_TIME = 1770000000000 // Fixed epoch for stable assertions

  beforeEach(() => {
    vi.clearAllMocks()
    deleteObjectMock.mockReset()
    deleteObjectMock.mockResolvedValue()
    backend.store = createTransactionStore({})
  })

  describe('extractEvidencePathInfo and Cross-Owner Isolation', () => {
    it('correctly extracts storage path and verifies complaint ownership', () => {
      const complaint = { id: 'CMP-100', complaintId: 'CMP-2026-0001' }

      const ownPath = extractEvidencePathInfo(
        'complaint-photos/CMP-100/street.jpg',
        complaint
      )
      expect(ownPath.storagePath).toBe('complaint-photos/CMP-100/street.jpg')
      expect(ownPath.isCrossOwner).toBe(false)
      expect(ownPath.isExternal).toBe(false)

      const ticketPath = extractEvidencePathInfo(
        'complaint-audio/CMP-2026-0001/voice.webm',
        complaint
      )
      expect(ticketPath.storagePath).toBe('complaint-audio/CMP-2026-0001/voice.webm')
      expect(ticketPath.isCrossOwner).toBe(false)
    })

    it('flags foreign complaint paths as cross-owner violations to prevent cross-tenant deletion', () => {
      const complaint = { id: 'CMP-100' }
      const foreignPath = extractEvidencePathInfo(
        'complaint-photos/CMP-999-OTHER/victim.jpg',
        complaint
      )
      expect(foreignPath.storagePath).toBe('complaint-photos/CMP-999-OTHER/victim.jpg')
      expect(foreignPath.isCrossOwner).toBe(true)
    })

    it('identifies external and dev mock URLs without treating them as Cloud Storage objects', () => {
      const info = extractEvidencePathInfo(
        'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7',
        { id: 'CMP-100' }
      )
      expect(info.isExternal).toBe(true)
      expect(info.storagePath).toBeNull()
    })

    it('recognizes existing tombstone records', () => {
      const tombstone = createEvidenceTombstone({ path: 'complaint-photos/CMP-100/old.jpg' })
      const info = extractEvidencePathInfo(tombstone, { id: 'CMP-100' })
      expect(info.isTombstoned).toBe(true)
      expect(info.storagePath).toBe('complaint-photos/CMP-100/old.jpg')
    })
  })

  describe('evaluateEvidenceRetentionEligibility', () => {
    it('rejects invalid or missing complaint documents', () => {
      const result = evaluateEvidenceRetentionEligibility(null)
      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('Invalid or missing')
    })

    it('rejects active complaints in Pending, In Progress, Reopened, or Pending Verification', () => {
      const activeStatuses = ['Pending', 'In Progress', 'Reopened', 'Pending Verification']
      for (const status of activeStatuses) {
        const result = evaluateEvidenceRetentionEligibility({
          id: 'CMP-1',
          status,
          photos: ['complaint-photos/CMP-1/p1.jpg'],
        })
        expect(result.eligible).toBe(false)
        expect(result.reason).toContain(`Complaint is currently active with status "${status}"`)
      }
    })

    it('rejects complaints with an active administrative or legal retention hold', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        retentionHold: {
          active: true,
          reason: 'Statutory audit inquiry',
        },
        photos: ['complaint-photos/CMP-1/photo.jpg'],
      }, { now: BASE_TIME })

      expect(result.eligible).toBe(false)
      expect(result.isHeld).toBe(true)
      expect(result.reason).toContain('Statutory audit inquiry')
    })

    it('rejects complaints with an active citizen dispute', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Disputed',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: ['complaint-photos/CMP-1/photo.jpg'],
      }, { now: BASE_TIME })

      expect(result.eligible).toBe(false)
      expect(result.hasActiveAppeal).toBe(true)
      expect(result.reason).toContain('active citizen dispute')
    })

    it('rejects Resolved complaints still within the 7-day citizen appeal window', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 3 * ONE_DAY_MS, // only 3 days ago
        photos: ['complaint-photos/CMP-1/photo.jpg'],
      }, { now: BASE_TIME })

      expect(result.eligible).toBe(false)
      expect(result.hasActiveAppeal).toBe(true)
      expect(result.reason).toContain('7-day citizen appeal window')
    })

    it('rejects closed complaints whose retention period (default 90 days) has not expired', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 45 * ONE_DAY_MS, // 45 days ago < 90 days
        photos: ['complaint-photos/CMP-1/photo.jpg'],
      }, { now: BASE_TIME, retentionDays: 90 })

      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('Retention period (90 days) has not elapsed')
      expect(result.retentionExpiresAt).toBe(BASE_TIME - 45 * ONE_DAY_MS + 90 * ONE_DAY_MS)
    })

    it('rejects closed complaints if all evidence items are already erased', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 100 * ONE_DAY_MS,
        photos: [createEvidenceTombstone()],
      }, { now: BASE_TIME })

      expect(result.eligible).toBe(false)
      expect(result.reason).toContain('No active or unerased evidence attachments')
    })

    it('declares eligible when closed status retention period elapsed, appeal window passed, and attachments exist', () => {
      const result = evaluateEvidenceRetentionEligibility({
        id: 'CMP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 100 * ONE_DAY_MS,
        photos: ['complaint-photos/CMP-1/photo.jpg'],
        audioNote: { url: 'complaint-audio/CMP-1/audio.webm' },
      }, { now: BASE_TIME, retentionDays: 90 })

      expect(result.eligible).toBe(true)
      expect(result.candidateEvidence.length).toBe(2)
      expect(result.policyVersion).toBe(DEFAULT_RETENTION_POLICY_VERSION)
    })
  })

  describe('Retention Hold Management', () => {
    const complaintPath = 'issues/CMP-HOLD-1'

    it('applies retention hold transactionally and logs audit event', async () => {
      backend.store.write(complaintPath, {
        id: 'CMP-HOLD-1',
        status: 'Resolved',
        description: 'Test issue',
      })

      const res = await applyRetentionHold(
        'CMP-HOLD-1',
        { reason: 'Grand Jury subpoena', holdId: 'HOLD-2026-99' },
        adminUser,
        { customDb: {} }
      )

      expect(res.success).toBe(true)
      const updated = backend.store.read(complaintPath)
      expect(updated.retentionHold.active).toBe(true)
      expect(updated.retentionHold.reason).toBe('Grand Jury subpoena')
      expect(updated.retentionHold.heldBy).toBe(adminUser.uid)

      // Audit event
      const auditEvent = backend.store.history.find(h => h.key.startsWith('issues/CMP-HOLD-1/events'))
      expect(auditEvent).toBeDefined()
      expect(auditEvent.data.action).toBe('Retention hold applied')
      expect(auditEvent.data.remarks).toContain('Grand Jury subpoena')
    })

    it('releases retention hold transactionally and logs audit event', async () => {
      backend.store.write(complaintPath, {
        id: 'CMP-HOLD-1',
        status: 'Resolved',
        retentionHold: {
          active: true,
          reason: 'Legal review',
          heldBy: 'admin-1',
        },
      })

      const res = await releaseRetentionHold(
        'CMP-HOLD-1',
        { reason: 'Case closed and matter resolved' },
        adminUser,
        { customDb: {} }
      )

      expect(res.success).toBe(true)
      const updated = backend.store.read(complaintPath)
      expect(updated.retentionHold.active).toBe(false)
      expect(updated.retentionHold.releaseReason).toBe('Case closed and matter resolved')

      const auditEvent = backend.store.history.find(
        h => h.key.startsWith('issues/CMP-HOLD-1/events') && h.data.action === 'Retention hold released'
      )
      expect(auditEvent).toBeDefined()
      expect(auditEvent.data.remarks).toContain('Case closed and matter resolved')
    })

    it('throws when attempting to release a hold on a complaint without an active hold', async () => {
      backend.store.write(complaintPath, {
        id: 'CMP-HOLD-1',
        status: 'Resolved',
      })

      await expect(
        releaseRetentionHold(
          'CMP-HOLD-1',
          { reason: 'Premature release' },
          adminUser,
          { customDb: {} }
        )
      ).rejects.toThrow('does not have an active retention hold')
    })
  })

  describe('executeEvidenceRetentionCleanup & Intent State Machine', () => {
    const complaintId = 'CMP-CLEANUP-1'
    const complaintPath = `issues/${complaintId}`

    it('dry-run mode evaluates candidates without deleting storage files or modifying documents', async () => {
      backend.store.write(complaintPath, {
        id: complaintId,
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: [`complaint-photos/${complaintId}/before.jpg`],
        audioNote: { path: `complaint-audio/${complaintId}/note.webm` },
      })

      const dryRunRes = await executeEvidenceRetentionCleanup({
        complaintId,
        dryRun: true,
        customDb: {},
        customStorage: {},
        now: BASE_TIME,
      })

      expect(dryRunRes.dryRun).toBe(true)
      expect(dryRunRes.eligible).toBe(true)
      expect(dryRunRes.candidateEvidence.length).toBe(2)
      expect(deleteObjectMock).not.toHaveBeenCalled()
      expect(backend.store.read(complaintPath).photos[0]).toBe(`complaint-photos/${complaintId}/before.jpg`)
    })

    it('deletes storage files, replaces references with tombstones, and logs minimal audit record', async () => {
      backend.store.write(complaintPath, {
        id: complaintId,
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: [`complaint-photos/${complaintId}/before.jpg`],
        audioNote: {
          path: `complaint-audio/${complaintId}/note.webm`,
          durationSeconds: 15,
        },
        resolutionProof: {
          path: `complaint-resolution-proof/${complaintId}/after.jpg`,
        },
      })

      const res = await executeEvidenceRetentionCleanup({
        complaintId,
        dryRun: false,
        customDb: {},
        customStorage: {},
        adminUser,
        now: BASE_TIME,
      })

      expect(res.success).toBe(true)
      expect(res.erasedCount).toBe(3)
      expect(deleteObjectMock).toHaveBeenCalledTimes(3)

      const updated = backend.store.read(complaintPath)
      expect(updated.evidenceErased).toBe(true)

      // Photos tombstone
      expect(updated.photos[0].tombstone).toBe(true)
      expect(updated.photos[0].path).toBe(`complaint-photos/${complaintId}/before.jpg`)

      // Audio tombstone preserving non-sensitive duration
      expect(updated.audioNote.tombstone).toBe(true)
      expect(updated.audioNote.durationSeconds).toBe(15)

      // Resolution proof tombstone
      expect(updated.resolutionProof.tombstone).toBe(true)

      // Intent state machine verification
      expect(updated.retentionCleanupIntents.photos_0.status).toBe(CLEANUP_INTENT_STATUS.COMPLETED)
      expect(updated.retentionCleanupIntents.audioNote.status).toBe(CLEANUP_INTENT_STATUS.COMPLETED)
      expect(updated.retentionCleanupIntents.resolutionProof.status).toBe(CLEANUP_INTENT_STATUS.COMPLETED)

      // Audit trail verification: minimal metadata only, no erased URLs in remarks
      const auditEvent = backend.store.history.find(
        h => h.key.startsWith(`issues/${complaintId}/events`) && h.data.action === 'Evidence retention erasure'
      )
      expect(auditEvent).toBeDefined()
      expect(auditEvent.data.remarks).toContain('Erased 3 evidence file(s)')
      expect(auditEvent.data.remarks).not.toContain('http')
      expect(auditEvent.data.remarks).not.toContain('.jpg')
    })

    it('converges idempotently on retry when storage file was already deleted', async () => {
      // Storage throws object-not-found (e.g. from prior interrupted attempt)
      deleteObjectMock.mockRejectedValueOnce({ code: 'storage/object-not-found' })

      backend.store.write(complaintPath, {
        id: complaintId,
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: [`complaint-photos/${complaintId}/photo1.jpg`],
        retentionCleanupIntents: {
          photos_0: {
            status: CLEANUP_INTENT_STATUS.INTENT_RECORDED,
            storagePath: `complaint-photos/${complaintId}/photo1.jpg`,
          },
        },
      })

      const res = await executeEvidenceRetentionCleanup({
        complaintId,
        dryRun: false,
        customDb: {},
        customStorage: {},
        adminUser,
        now: BASE_TIME,
      })

      expect(res.success).toBe(true)
      const updated = backend.store.read(complaintPath)
      expect(updated.photos[0].tombstone).toBe(true)
      expect(updated.retentionCleanupIntents.photos_0.status).toBe(CLEANUP_INTENT_STATUS.COMPLETED)
    })

    it('refuses to delete Storage objects from foreign complaint paths', async () => {
      backend.store.write(complaintPath, {
        id: complaintId,
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: [
          `complaint-photos/FOREIGN_COMPLAINT_999/innocent.jpg`,
        ],
      })

      const res = await executeEvidenceRetentionCleanup({
        complaintId,
        dryRun: false,
        customDb: {},
        customStorage: {},
        adminUser,
        now: BASE_TIME,
      })

      // Must NOT invoke Storage deletion on foreign paths!
      expect(deleteObjectMock).not.toHaveBeenCalled()
      const updated = backend.store.read(complaintPath)
      expect(updated.retentionCleanupIntents.photos_0.status).toBe(
        CLEANUP_INTENT_STATUS.SKIPPED_CROSS_OWNER
      )
    })

    it('records FAILED intent status and preserves retryability when storage deletion encounters network error', async () => {
      deleteObjectMock.mockRejectedValueOnce(new Error('Storage service unavailable'))

      backend.store.write(complaintPath, {
        id: complaintId,
        status: 'Resolved',
        resolvedAt: BASE_TIME - 120 * ONE_DAY_MS,
        photos: [`complaint-photos/${complaintId}/photo-fail.jpg`],
      })

      const res = await executeEvidenceRetentionCleanup({
        complaintId,
        dryRun: false,
        customDb: {},
        customStorage: {},
        adminUser,
        now: BASE_TIME,
      })

      expect(res.success).toBe(false)
      expect(res.errors.length).toBe(1)
      expect(res.errors[0].error).toBe('Storage service unavailable')
      expect(res.intents.photos_0.status).toBe(CLEANUP_INTENT_STATUS.FAILED)
    })

    it('runs retention cleanup sweep across closed complaints', async () => {
      const eligibleDoc = {
        id: 'CMP-SWEEP-1',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 100 * ONE_DAY_MS,
        photos: ['complaint-photos/CMP-SWEEP-1/photo.jpg'],
      }
      const ineligibleDoc = {
        id: 'CMP-SWEEP-2',
        status: 'Resolved',
        resolvedAt: BASE_TIME - 20 * ONE_DAY_MS, // too fresh
        photos: ['complaint-photos/CMP-SWEEP-2/photo.jpg'],
      }

      backend.store.write('issues/CMP-SWEEP-1', eligibleDoc)
      backend.store.write('issues/CMP-SWEEP-2', ineligibleDoc)
      backend.allDocs = [
        { id: 'CMP-SWEEP-1', data: eligibleDoc },
        { id: 'CMP-SWEEP-2', data: ineligibleDoc },
      ]

      const sweepDryRun = await runRetentionCleanupSweep({
        dryRun: true,
        customDb: {},
        customStorage: {},
        adminUser,
        now: BASE_TIME,
      })

      expect(sweepDryRun.totalInspected).toBe(2)
      expect(sweepDryRun.eligibleCount).toBe(1)
      expect(sweepDryRun.results.find(r => r.complaintId === 'CMP-SWEEP-1').eligible).toBe(true)
      expect(sweepDryRun.results.find(r => r.complaintId === 'CMP-SWEEP-2').eligible).toBe(false)
    })
  })
})
