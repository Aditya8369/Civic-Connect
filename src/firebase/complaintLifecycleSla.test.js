// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pauseComplaintSla,
  resumeComplaintSla,
  recordSlaEscalation,
} from './complaintLifecycle'
import { DEFAULT_SLA_POLICY_VERSION } from '../utils/businessCalendarSla'

const testState = vi.hoisted(() => ({
  complaints: {},
  events: [],
  notifications: [],
  batches: [],
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  let idCounter = 0
  return {
    doc: (...args) => {
      if (args.length === 1) {
        return `${args[0]}/event-${++idCounter}`
      }
      if (args.length === 2) {
        return `${args[0]}/${args[1]}`
      }
      return `${args[1]}/${args[2]}`
    },
    collection: (_db, path) => path,
    serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
    Timestamp: {
      fromMillis: (ms) => ({ toMillis: () => ms, toDate: () => new Date(ms) }),
      fromDate: (d) => ({ toMillis: () => d.getTime(), toDate: () => d }),
    },
    runTransaction: async (_db, callback) => {
      const transaction = {
        get: async (ref) => {
          const docId = ref.split('/').pop()
          const data = testState.complaints[docId]
          return {
            exists: () => Boolean(data),
            data: () => data,
          }
        },
        update: (ref, changes) => {
          const docId = ref.split('/').pop()
          const current = { ...(testState.complaints[docId] || {}) }
          for (const [k, v] of Object.entries(changes)) {
            if (k.includes('.')) {
              const [parent, child] = k.split('.')
              current[parent] = { ...(current[parent] || {}), [child]: v }
            } else {
              current[k] = v
            }
          }
          testState.complaints[docId] = current
        },
        set: (ref, data) => {
          if (ref && ref.includes('/events')) {
            testState.events.push({ ref, data })
          }
        },
      }
      return callback(transaction)
    },
  }
})

vi.mock('./notifications', () => ({
  addNotificationToBatch: (_transaction, notif) => {
    testState.notifications.push(notif)
  },
}))

describe('Complaint SLA Lifecycle Operations (Issue #282)', () => {
  const adminUser = { uid: 'admin-1', role: 'admin', name: 'Super Admin' }
  const citizenUser = { uid: 'citizen-1', role: 'citizen', name: 'John Doe' }

  beforeEach(() => {
    testState.complaints = {}
    testState.events = []
    testState.notifications = []
    vi.clearAllMocks()
  })

  describe('pauseComplaintSla', () => {
    it('rejects unauthorized non-admin users', async () => {
      await expect(
        pauseComplaintSla('c1', { reason: 'Material delay' }, citizenUser)
      ).rejects.toThrow('Only authorized municipal administrators may pause the SLA clock')
    })

    it('rejects invalid or terminal complaint states', async () => {
      testState.complaints['c-resolved'] = {
        status: 'Resolved',
        reportedBy: 'citizen-1',
      }
      await expect(
        pauseComplaintSla('c-resolved', { reason: 'Material delay' }, adminUser)
      ).rejects.toThrow('cannot have its SLA clock paused')
    })

    it('rejects pausing if already paused', async () => {
      testState.complaints['c-paused'] = {
        status: 'In Progress',
        slaPause: { isPaused: true, pausedAt: Date.now() },
      }
      await expect(
        pauseComplaintSla('c-paused', { reason: 'Material delay' }, adminUser)
      ).rejects.toThrow('SLA clock is already paused')
    })

    it('transactionally pauses active complaint with audited event and notification', async () => {
      testState.complaints['c1'] = {
        id: 'c1',
        status: 'In Progress',
        department: 'Roads',
        reportedBy: 'citizen-1',
        complaintId: 'CMP-2026-0001',
      }

      const result = await pauseComplaintSla(
        'c1',
        { reason: 'Awaiting specialized asphalt machinery', remarks: 'Vendor dispatch scheduled' },
        adminUser
      )

      expect(result.success).toBe(true)
      expect(testState.complaints['c1'].slaPause.isPaused).toBe(true)
      expect(testState.complaints['c1'].slaPause.reason).toBe(
        'Awaiting specialized asphalt machinery'
      )

      expect(testState.events).toHaveLength(1)
      expect(testState.events[0].data.action).toBe('SLA paused')
      expect(testState.events[0].data.actorUid).toBe('admin-1')

      expect(testState.notifications).toHaveLength(1)
      expect(testState.notifications[0].recipientUid).toBe('citizen-1')
      expect(testState.notifications[0].title).toBe('Complaint SLA Clock Paused')
    })
  })

  describe('resumeComplaintSla', () => {
    it('rejects non-admin caller', async () => {
      await expect(resumeComplaintSla('c1', {}, citizenUser)).rejects.toThrow(
        'Only authorized municipal administrators may resume the SLA clock'
      )
    })

    it('rejects resuming if complaint is not currently paused', async () => {
      testState.complaints['c-unpaused'] = {
        status: 'In Progress',
        slaPause: { isPaused: false },
      }
      await expect(resumeComplaintSla('c-unpaused', {}, adminUser)).rejects.toThrow(
        'SLA clock is not currently paused'
      )
    })

    it('resumes SLA clock, archives pause history, advances effective deadline, and logs audit event', async () => {
      const nowMs = Date.now()
      const createdMs = nowMs - 5 * 3600000 // Created 5 hours ago
      const pausedAtMs = nowMs - 2 * 3600000 // Paused 2 hours ago

      testState.complaints['c1'] = {
        id: 'c1',
        status: 'In Progress',
        department: 'Sanitation',
        reportedBy: 'citizen-1',
        createdAt: createdMs,
        slaPause: {
          isPaused: true,
          pausedAt: pausedAtMs,
          reason: 'Awaiting citizen address confirmation',
          pausedBy: 'admin-1',
          maxDurationHours: 72,
        },
        slaPauseHistory: [],
      }

      const result = await resumeComplaintSla(
        'c1',
        { remarks: 'Citizen verified address' },
        adminUser
      )

      expect(result.success).toBe(true)
      const updated = testState.complaints['c1']
      expect(updated.slaPause.isPaused).toBe(false)
      expect(updated.slaPauseHistory).toHaveLength(1)
      expect(updated.slaPauseHistory[0].reason).toBe('Awaiting citizen address confirmation')
      expect(updated.slaPauseHistory[0].appliedDurationMs).toBeGreaterThan(0)
      expect(updated.effectiveSlaDeadline).toBeDefined()

      expect(testState.events).toHaveLength(1)
      expect(testState.events[0].data.action).toBe('SLA resumed')
      expect(testState.notifications).toHaveLength(1)
      expect(testState.notifications[0].title).toBe('Complaint SLA Clock Resumed')
    })
  })

  describe('recordSlaEscalation', () => {
    it('idempotently records escalation per threshold and policy version', async () => {
      testState.complaints['c-esc'] = {
        id: 'c-esc',
        status: 'In Progress',
        slaEscalations: {},
      }

      const res1 = await recordSlaEscalation('c-esc', {
        thresholdKey: 'tier_0_8',
        threshold: 0.8,
        policyVersion: DEFAULT_SLA_POLICY_VERSION,
      })
      expect(res1.success).toBe(true)
      expect(testState.complaints['c-esc'].slaEscalations['tier_0_8']).toBeDefined()

      // Retry with identical threshold and policy version
      const res2 = await recordSlaEscalation('c-esc', {
        thresholdKey: 'tier_0_8',
        threshold: 0.8,
        policyVersion: DEFAULT_SLA_POLICY_VERSION,
      })
      expect(res2.skipped).toBe(true)
      expect(res2.reason).toBe('already_escalated')

      // Record higher threshold tier (e.g. 1.0 breach)
      const res3 = await recordSlaEscalation('c-esc', {
        thresholdKey: 'tier_1_0',
        threshold: 1.0,
        policyVersion: DEFAULT_SLA_POLICY_VERSION,
      })
      expect(res3.success).toBe(true)
    })
  })
})
