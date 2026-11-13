import { beforeEach, expect, it, vi } from 'vitest'
import { createTransactionStore } from './testSupport/transactionStore'
import { bulkUpdateComplaintsStatus } from './bulkComplaints'

const runtime = vi.hoisted(() => ({ store: null, counter: 0, calls: 0, failAt: null }))
vi.mock('./services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => {
  const runTransaction = (db, callback) => {
    runtime.calls++
    if (runtime.calls === runtime.failAt) return Promise.reject(new Error('Commit failed'))
    return runtime.store.runTransaction(db, callback)
  }
  return {
    doc: (ref, ...parts) => parts.length ? parts.join('/') : ref + '/' + ++runtime.counter,
    collection: (_db, name) => name,
    serverTimestamp: () => 'server-time',
    runTransaction,
    writeBatch: db => {
      const writes = []
      return {
        update: (ref, data) => writes.push(['update', ref, data]),
        set: (ref, data) => writes.push(['set', ref, data]),
        commit: () => runTransaction(db, async transaction => {
          for (const [method, ref, data] of writes) transaction[method](ref, data)
        }),
      }
    },
  }
})

const original = {
  status: 'Resolved', title: 'Lamp', description: 'Broken lamp', department: 'Electricity',
  reportedBy: 'citizen-1', complaintId: 'CMP-2026-0001',
  resolvedAt: 'original-resolution', updatedAt: 'original-update',
}
const appealed = { ...original, status: 'Reopened', reopenReason: 'Still broken', reopenedAt: 'appeal-time', updatedAt: 'appeal-time' }
const options = {
  complaintIds: ['c1'], complaints: [{ id: 'c1', ...original }],
  newStatus: 'In Progress', actorUid: 'admin-1',
}

beforeEach(() => {
  runtime.store = createTransactionStore({ 'issues/c1': original })
  runtime.counter = 0
  runtime.calls = 0
  runtime.failAt = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

it('preserves an appeal committed after the admin snapshot and emits no bulk side effects', async () => {
  runtime.store.write('issues/c1', appealed)
  runtime.store.history.length = 0
  const result = await bulkUpdateComplaintsStatus({ ...options, newStatus: 'Resolved' })
  expect(result).toMatchObject({ success: false, count: 0, conflictIds: ['c1'], failedIds: [] })
  expect(runtime.store.read('issues/c1')).toEqual(appealed)
  expect(runtime.store.history).toEqual([])
})

it('rechecks the expected status after Firestore retries the callback', async () => {
  runtime.store.beforeCommit = () => runtime.store.write('issues/c1', appealed)
  const result = await bulkUpdateComplaintsStatus(options)
  expect(runtime.store.conflicts).toBe(1)
  expect(result).toMatchObject({ count: 0, conflictIds: ['c1'] })
  expect(runtime.store.read('issues/c1')).toEqual(appealed)
  expect(runtime.store.history).toEqual([{ key: 'issues/c1', data: appealed }])
})

it('commits eligible items in a mixed selection and preserves the conflicting item', async () => {
  const pending = { ...original, status: 'Pending', title: 'Pothole', complaintId: 'CMP-2026-0002' }
  runtime.store = createTransactionStore({ 'issues/c1': appealed, 'issues/c2': pending })
  const result = await bulkUpdateComplaintsStatus({
    ...options, complaintIds: ['c1', 'c2'], complaints: [...options.complaints, { id: 'c2', ...pending }],
    newStatus: 'Resolved',
  })
  expect(result).toMatchObject({ success: false, count: 1, conflictIds: ['c1'], failedIds: [] })
  expect(runtime.store.read('issues/c1')).toEqual(appealed)
  expect(runtime.store.read('issues/c2')).toEqual({ ...pending, status: 'Resolved', resolvedAt: 'server-time', updatedAt: 'server-time' })
  expect(runtime.store.history).toHaveLength(3)
  const event = runtime.store.history.find(write => write.key.startsWith('issues/c2/events/'))
  expect(event.data).toMatchObject({ previousStatus: 'Pending', newStatus: 'Resolved', actorUid: 'admin-1' })
  const notice = runtime.store.history.find(write => write.key.startsWith('notifications/'))
  expect(notice.data).toMatchObject({ recipientUid: pending.reportedBy, issueId: pending.complaintId })
})

it('uses the committed read for metadata and notifications after a retry', async () => {
  const current = { ...original, title: 'New title', department: 'Roads', reportedBy: 'current-owner', complaintId: 'CMP-2026-0099' }
  runtime.store.beforeCommit = () => runtime.store.write('issues/c1', current)
  const result = await bulkUpdateComplaintsStatus(options)
  expect(result).toMatchObject({ success: true, count: 1, conflictIds: [] })
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read('issues/c1')).toEqual({ ...current, status: 'In Progress', updatedAt: 'server-time' })
  const notices = runtime.store.history.filter(write => write.key.startsWith('notifications/'))
  const events = runtime.store.history.filter(write => write.key.includes('/events/'))
  expect(notices).toHaveLength(1)
  expect(events).toHaveLength(1)
  expect(notices[0].data).toMatchObject({ recipientUid: 'current-owner', issueId: current.complaintId })
  expect(events[0].data).toMatchObject({ previousStatus: 'Resolved', newStatus: 'In Progress' })
})

it('does not refresh the resolution timestamp or write events for an unchanged status', async () => {
  const result = await bulkUpdateComplaintsStatus({ ...options, newStatus: 'Resolved' })
  expect(result).toMatchObject({ success: true, count: 0, unchangedIds: ['c1'], conflictIds: [] })
  expect(runtime.store.read('issues/c1')).toEqual(original)
  expect(runtime.store.history).toEqual([])
})

it('reports missing snapshots and deleted documents as conflicts without recreating them', async () => {
  const result = await bulkUpdateComplaintsStatus({ ...options, complaintIds: ['c1', 'deleted'], complaints: [{ id: 'deleted', status: 'Pending' }] })
  expect(result).toMatchObject({ count: 0, conflictIds: ['c1', 'deleted'] })
  expect(runtime.store.history).toEqual([])
})

it('handles a deletion between the read and commit by retrying without writes', async () => {
  runtime.store.beforeCommit = () => runtime.store.remove('issues/c1')
  const result = await bulkUpdateComplaintsStatus(options)
  expect(result).toMatchObject({ count: 0, conflictIds: ['c1'] })
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.read('issues/c1')).toBeUndefined()
  expect(runtime.store.history).toEqual([])
})

it('keeps complaint, event and notice atomic on commit failure', async () => {
  runtime.store.failCommit = new Error('Permission denied')
  const result = await bulkUpdateComplaintsStatus(options)
  expect(result).toMatchObject({ success: false, count: 0, conflictIds: [], failedIds: ['c1'] })
  expect(runtime.store.history).toEqual([])
  expect(runtime.store.read('issues/c1')).toEqual(original)
})

it('reports earlier successful chunks when a later chunk fails', async () => {
  const ids = Array.from({ length: 151 }, (_, index) => 'c' + index)
  const complaints = ids.map(id => ({ id, ...original }))
  runtime.store = createTransactionStore(Object.fromEntries(complaints.map(({ id, ...data }) => ['issues/' + id, data])))
  runtime.failAt = 2
  const result = await bulkUpdateComplaintsStatus({ ...options, complaintIds: ids, complaints })
  expect(result).toMatchObject({ success: false, count: 150, failedIds: ['c150'], conflictIds: [] })
  expect(runtime.store.read('issues/c0').status).toBe('In Progress')
  expect(runtime.store.read('issues/c150')).toEqual(original)
  expect(runtime.store.history).toHaveLength(450)
})

it('writes only one event and notice for competing admins with the same snapshot', async () => {
  const results = await Promise.all([
    bulkUpdateComplaintsStatus(options),
    bulkUpdateComplaintsStatus({ ...options, actorUid: 'admin-2' }),
  ])
  expect(results.map(result => result.count).sort()).toEqual([0, 1])
  expect(results.flatMap(result => result.conflictIds)).toEqual(['c1'])
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.history).toHaveLength(3)
})

it('deduplicates selected document IDs before counting and writing', async () => {
  const result = await bulkUpdateComplaintsStatus({ ...options, complaintIds: ['c1', 'c1'] })
  expect(result.count).toBe(1)
  expect(runtime.store.history).toHaveLength(3)
})
