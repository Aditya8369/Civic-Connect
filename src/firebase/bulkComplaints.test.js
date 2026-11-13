// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bulkUpdateComplaintsStatus,
  bulkAssignComplaintsDepartment,
  executeBulkComplaintAction,
  normalizeComplaintsMap,
} from './bulkComplaints'

const runtime = vi.hoisted(() => ({
  batches: [],
  counter: 0,
  complaints: {},
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  const writeBatch = () => {
    const currentBatch = {
      updates: [],
      sets: [],
      committed: false,
      update: (ref, data) => currentBatch.updates.push({ ref, data }),
      set: (ref, data) => currentBatch.sets.push({ ref, data }),
      commit: async () => {
        currentBatch.committed = true
      },
    }
    runtime.batches.push(currentBatch)
    return currentBatch
  }
  return {
    doc: (ref, ...parts) => (parts.length ? parts.join('/') : `${ref}/${++runtime.counter}`),
    collection: (_db, name) => name,
    serverTimestamp: () => 'server-time',
    writeBatch,
    runTransaction: async (_db, callback) => {
      const transaction = writeBatch()
      transaction.get = async ref => ({
        data: () => runtime.complaints[ref.split('/').at(-1)],
      })
      const result = await callback(transaction)
      await transaction.commit()
      return result
    },
  }
})

describe('bulkComplaints service', () => {
  beforeEach(() => {
    runtime.batches = []
    runtime.counter = 0
    runtime.complaints = {}
    vi.clearAllMocks()
  })

  describe('normalizeComplaintsMap', () => {
    it('normalizes an array of complaints into an id-indexed map', () => {
      const list = [
        { id: 'c1', title: 'Pothole' },
        { id: 'c2', title: 'Streetlight' },
      ]
      const map = normalizeComplaintsMap(list)
      expect(map).toEqual({
        c1: { id: 'c1', title: 'Pothole' },
        c2: { id: 'c2', title: 'Streetlight' },
      })
    })

    it('returns empty object when passed null or undefined', () => {
      expect(normalizeComplaintsMap(null)).toEqual({})
      expect(normalizeComplaintsMap(undefined)).toEqual({})
    })
  })

  describe('bulkUpdateComplaintsStatus', () => {
    it('returns count 0 without creating batch when complaintIds is empty', async () => {
      const result = await bulkUpdateComplaintsStatus({
        complaintIds: [],
        newStatus: 'In Progress',
      })
      expect(result).toEqual({ success: true, count: 0 })
      expect(runtime.batches).toHaveLength(0)
    })

    it('throws error when newStatus is missing', async () => {
      await expect(
        bulkUpdateComplaintsStatus({
          complaintIds: ['c1'],
          newStatus: '',
        })
      ).rejects.toThrow('New status is required')
    })

    it('performs transactional status update with atomic audit event creation', async () => {
      const complaints = [
        {
          id: 'c1',
          title: 'Damaged sidewalk',
          status: 'Pending',
          reportedBy: 'user-1',
          complaintId: 'CMP-2026-0001',
        },
        {
          id: 'c2',
          title: 'Water leak',
          status: 'Pending',
          reportedBy: 'user-2',
          complaintId: 'CMP-2026-0002',
        },
      ]

      runtime.complaints = Object.fromEntries(complaints.map(complaint => [complaint.id, complaint]))
      const result = await bulkUpdateComplaintsStatus({
        complaintIds: ['c1', 'c2'],
        complaints,
        newStatus: 'In Progress',
        actorUid: 'admin-99',
        remarks: 'Triage team morning update',
      })

      expect(result).toMatchObject({ success: true, count: 2, conflictIds: [], failedIds: [] })
      expect(runtime.batches).toHaveLength(1)

      const batch = runtime.batches[0]
      expect(batch.committed).toBe(true)

      // Verify complaint document updates
      expect(batch.updates).toHaveLength(2)
      expect(batch.updates[0]).toEqual({
        ref: 'issues/c1',
        data: {
          status: 'In Progress',
          updatedAt: 'server-time',
        },
      })
      expect(batch.updates[1]).toEqual({
        ref: 'issues/c2',
        data: {
          status: 'In Progress',
          updatedAt: 'server-time',
        },
      })

      // Verify atomic audit events in issues/{id}/events sub-collection
      const eventSets = batch.sets.filter((s) => s.ref.includes('/events/'))
      expect(eventSets).toHaveLength(2)

      expect(eventSets[0]).toEqual({
        ref: 'issues/c1/events/1',
        data: {
          timestamp: 'server-time',
          actorUid: 'admin-99',
          action: 'Status changed',
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          remarks: 'Triage team morning update',
        },
      })

      expect(eventSets[1]).toEqual({
        ref: 'issues/c2/events/3',
        data: {
          timestamp: 'server-time',
          actorUid: 'admin-99',
          action: 'Status changed',
          previousStatus: 'Pending',
          newStatus: 'In Progress',
          remarks: 'Triage team morning update',
        },
      })

      // Verify notifications
      const notifSets = batch.sets.filter((s) => s.ref.includes('notifications/'))
      expect(notifSets).toHaveLength(2)
      expect(notifSets[0].data.recipientUid).toBe('user-1')
      expect(notifSets[0].data.issueId).toBe('CMP-2026-0001')
      expect(notifSets[0].data.message).toContain('In Progress')
    })

    it('sets resolvedAt timestamp when updating status to Resolved', async () => {
      const complaints = [{ id: 'c1', status: 'In Progress' }]
      runtime.complaints = { c1: complaints[0] }

      await bulkUpdateComplaintsStatus({
        complaintIds: ['c1'],
        complaints,
        newStatus: 'Resolved',
        actorUid: 'admin-1',
      })

      const batch = runtime.batches[0]
      expect(batch.updates[0].data).toEqual({
        status: 'Resolved',
        updatedAt: 'server-time',
        resolvedAt: 'server-time',
      })
      const event = batch.sets.find((s) => s.ref.includes('/events/'))
      expect(event.data.newStatus).toBe('Resolved')
    })

    it('splits large updates into transactions within the Firestore write limit', async () => {
      const ids = Array.from({ length: 320 }, (_, i) => `complaint-${i}`)
      const complaints = ids.map((id) => ({ id, status: 'Pending' }))
      runtime.complaints = Object.fromEntries(complaints.map(complaint => [complaint.id, complaint]))

      const result = await bulkUpdateComplaintsStatus({
        complaintIds: ids,
        complaints,
        newStatus: 'In Progress',
        actorUid: 'admin-1',
      })

      expect(result.count).toBe(320)
      // 320 items / 150 per chunk = 3 batches
      expect(runtime.batches).toHaveLength(3)
      expect(runtime.batches[0].committed).toBe(true)
      expect(runtime.batches[1].committed).toBe(true)
      expect(runtime.batches[2].committed).toBe(true)
      expect(runtime.batches[0].updates).toHaveLength(150)
      expect(runtime.batches[1].updates).toHaveLength(150)
      expect(runtime.batches[2].updates).toHaveLength(20)
    })
  })

  describe('bulkAssignComplaintsDepartment', () => {
    it('throws error when newDepartment is missing', async () => {
      await expect(
        bulkAssignComplaintsDepartment({
          complaintIds: ['c1'],
          newDepartment: '',
        })
      ).rejects.toThrow('New department is required')
    })

    it('performs batched department reassignment with atomic audit event creation', async () => {
      const complaints = [
        {
          id: 'c10',
          title: 'Clogged drain',
          status: 'In Progress',
          department: 'Roads',
          reportedBy: 'citizen-8',
          complaintId: 'CMP-2026-0010',
        },
      ]

      runtime.complaints = { c10: complaints[0] }
      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['c10'],
        complaints,
        newDepartment: 'Sanitation',
        actorUid: 'admin-42',
      })

      expect(result).toEqual({ success: true, count: 1, conflictIds: [], failedIds: [], unchangedIds: [] })
      expect(runtime.batches).toHaveLength(1)

      const batch = runtime.batches[0]
      expect(batch.updates[0]).toEqual({
        ref: 'issues/c10',
        data: {
          department: 'Sanitation',
          updatedAt: 'server-time',
        },
      })

      const event = batch.sets.find((s) => s.ref.includes('/events/'))
      expect(event.data).toEqual({
        timestamp: 'server-time',
        actorUid: 'admin-42',
        action: 'Department assigned',
        previousStatus: 'In Progress',
        newStatus: 'In Progress',
        remarks: 'Bulk department reassignment to Sanitation',
      })

      const notif = batch.sets.find((s) => s.ref.includes('notifications/'))
      expect(notif.data.recipientUid).toBe('citizen-8')
      expect(notif.data.title).toBe('Department Assigned')
      expect(notif.data.message).toContain('Sanitation')
    })

    it('isolates nonexistent documents into failedIds without failing valid updates', async () => {
      runtime.complaints = {
        cValid: {
          id: 'cValid',
          status: 'Pending',
          department: 'Roads',
          reportedBy: 'user-valid',
        },
      }

      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['cValid', 'cMissing'],
        newDepartment: 'Sanitation',
        actorUid: 'admin-1',
      })

      expect(result).toEqual({
        success: false,
        count: 1,
        conflictIds: [],
        failedIds: ['cMissing'],
        unchangedIds: [],
      })
      expect(runtime.batches[0].updates[0].ref).toBe('issues/cValid')
    })

    it('identifies terminal complaints (Merged - Duplicate, Rejected) as conflictIds and skips updating them', async () => {
      runtime.complaints = {
        cMerged: {
          id: 'cMerged',
          status: 'Merged - Duplicate',
          department: 'Roads',
        },
        cRejected: {
          id: 'cRejected',
          status: 'Rejected',
          department: 'Roads',
        },
        cValid: {
          id: 'cValid',
          status: 'In Progress',
          department: 'Roads',
          reportedBy: 'user-1',
        },
      }

      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['cMerged', 'cRejected', 'cValid'],
        newDepartment: 'Sanitation',
        actorUid: 'admin-1',
      })

      expect(result).toEqual({
        success: false,
        count: 1,
        conflictIds: ['cMerged', 'cRejected'],
        failedIds: [],
        unchangedIds: [],
      })
      expect(runtime.batches[0].updates).toHaveLength(1)
      expect(runtime.batches[0].updates[0].ref).toBe('issues/cValid')
    })

    it('identifies complaints already in the target department as unchangedIds and skips updating them', async () => {
      runtime.complaints = {
        cSame: {
          id: 'cSame',
          status: 'Pending',
          department: 'Sanitation',
        },
        cOther: {
          id: 'cOther',
          status: 'Pending',
          department: 'Roads',
          reportedBy: 'user-2',
        },
      }

      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['cSame', 'cOther'],
        newDepartment: 'Sanitation',
        actorUid: 'admin-1',
      })

      expect(result).toEqual({
        success: true,
        count: 1,
        conflictIds: [],
        failedIds: [],
        unchangedIds: ['cSame'],
      })
      expect(runtime.batches[0].updates).toHaveLength(1)
      expect(runtime.batches[0].updates[0].ref).toBe('issues/cOther')
    })

    it('guarantees notification delivery and accurate audit event using live snapshot when complaints array is empty', async () => {
      runtime.complaints = {
        cLive: {
          id: 'cLive',
          status: 'In Progress',
          department: 'Roads',
          reportedBy: 'citizen-live-uid',
          complaintId: 'CMP-2026-LIVE',
        },
      }

      const result = await bulkAssignComplaintsDepartment({
        complaintIds: ['cLive'],
        complaints: [], // Empty cache passed by caller
        newDepartment: 'Electricity',
        actorUid: 'admin-triage',
      })

      expect(result.success).toBe(true)
      expect(result.count).toBe(1)

      const batch = runtime.batches[0]
      const notif = batch.sets.find((s) => s.ref.includes('notifications/'))
      expect(notif).toBeDefined()
      expect(notif.data.recipientUid).toBe('citizen-live-uid')
      expect(notif.data.issueId).toBe('CMP-2026-LIVE')

      const event = batch.sets.find((s) => s.ref.includes('/events/'))
      expect(event).toBeDefined()
      expect(event.data.previousStatus).toBe('In Progress')
      expect(event.data.newStatus).toBe('In Progress')
    })
  })

  describe('executeBulkComplaintAction dispatcher', () => {
    it('routes status action correctly', async () => {
      runtime.complaints = { c1: { status: 'In Progress' } }
      const result = await executeBulkComplaintAction({
        actionType: 'status',
        value: 'Resolved',
        complaintIds: ['c1'],
        complaints: [{ id: 'c1', status: 'In Progress' }],
        actorUid: 'admin-1',
      })
      expect(result.success).toBe(true)
      expect(runtime.batches[0].updates[0].data.status).toBe('Resolved')
    })

    it('routes department action correctly', async () => {
      runtime.complaints = { c2: { id: 'c2', status: 'Pending', department: 'Roads' } }
      const result = await executeBulkComplaintAction({
        actionType: 'department',
        value: 'Electricity',
        complaintIds: ['c2'],
        complaints: [{ id: 'c2', status: 'Pending' }],
        actorUid: 'admin-1',
      })
      expect(result.success).toBe(true)
      expect(runtime.batches[0].updates[0].data.department).toBe('Electricity')
    })

    it('throws error for unsupported action type', async () => {
      await expect(
        executeBulkComplaintAction({
          actionType: 'unsupported',
          value: 'test',
          complaintIds: ['c1'],
        })
      ).rejects.toThrow('Unsupported bulk action type')
    })
  })
})
