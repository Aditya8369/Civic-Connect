import { beforeEach, expect, it, vi, describe } from 'vitest'
import {
  buildComplaintEvent,
  logComplaintEvent,
  addComplaintEventToBatch,
  sortEvents,
  formatEventDate,
} from './complaintEvents'
import { commitComplaintTransition } from './complaintLifecycle'
import { createTransactionStore } from './testSupport/transactionStore'

const runtime = vi.hoisted(() => ({ store: null, counter: 0 }))
vi.mock('./services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => parts.length ? parts.join('/') : ref + '/' + ++runtime.counter,
  collection: (_db, name) => name,
  addDoc: async (key, data) => {
    const id = ++runtime.counter
    const path = `${key}/${id}`
    runtime.store.write(path, data)
    return { id, path }
  },
  runTransaction: (db, callback) =>
    runtime.store.runTransaction(db, tx => callback({
      ...tx,
      get: async key => {
        const snap = await tx.get(key)
        return { exists: () => snap.exists(), data: () => snap.data() }
      },
    })),
  serverTimestamp: () => 'server-time',
}))

beforeEach(() => {
  runtime.counter = 0
  runtime.store = createTransactionStore()
})

it('buildComplaintEvent constructs the expected schema', () => {
  const event = buildComplaintEvent({
    actorUid: 'user-123',
    action: 'Department assigned',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Department assigned: Roads',
  })

  expect(event).toEqual({
    timestamp: 'server-time',
    actorUid: 'user-123',
    action: 'Department assigned',
    previousStatus: 'Pending',
    newStatus: 'Pending',
    remarks: 'Department assigned: Roads',
  })
})

it('logComplaintEvent writes an immutable audit event to issues/{id}/events sub-collection', async () => {
  await logComplaintEvent('issue-42', {
    actorUid: 'admin-1',
    action: 'Field worker designated',
    previousStatus: 'In Progress',
    newStatus: 'In Progress',
    remarks: 'Assigned to Ramesh (+91 9876543210)',
  })

  const written = runtime.store.read('issues/issue-42/events/1')
  expect(written).toEqual({
    timestamp: 'server-time',
    actorUid: 'admin-1',
    action: 'Field worker designated',
    previousStatus: 'In Progress',
    newStatus: 'In Progress',
    remarks: 'Assigned to Ramesh (+91 9876543210)',
  })
})

it('addComplaintEventToBatch queues an event write in batch to issues/{id}/events', () => {
  const staged = []
  const mockBatch = {
    set: (ref, data) => staged.push({ ref, data }),
  }

  const ref = addComplaintEventToBatch(mockBatch, 'issue-99', {
    actorUid: 'citizen-9',
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Broken water pipe on 5th street',
  })

  expect(ref).toBe('issues/issue-99/events/1')
  expect(staged).toHaveLength(1)
  expect(staged[0].data).toEqual({
    timestamp: 'server-time',
    actorUid: 'citizen-9',
    action: 'Complaint submitted',
    previousStatus: null,
    newStatus: 'Pending',
    remarks: 'Broken water pipe on 5th street',
  })
})

it('commitComplaintTransition commits audit event atomically with issue changes', async () => {
  const issuePath = 'issues/issue-55'
  runtime.store = createTransactionStore({
    [issuePath]: {
      status: 'Pending',
      title: 'Streetlight out',
      reportedBy: 'citizen-1',
      complaintId: 'CMP-2026-0001',
    },
  })

  await commitComplaintTransition(
    'issue-55',
    'Pending',
    { status: 'In Progress', updatedAt: 'server-time' },
    () => null,
    () => true,
    current => ({
      actorUid: 'admin-2',
      action: 'Status changed',
      previousStatus: current.status,
      newStatus: 'In Progress',
      remarks: 'Status updated to In Progress',
    })
  )

  expect(runtime.store.read(issuePath).status).toBe('In Progress')
  const event = runtime.store.read('issues/issue-55/events/1')
  expect(event).toEqual({
    timestamp: 'server-time',
    actorUid: 'admin-2',
    action: 'Status changed',
    previousStatus: 'Pending',
    newStatus: 'In Progress',
    remarks: 'Status updated to In Progress',
  })
})

describe('sortEvents', () => {
  it('returns empty array when given non-array or empty list', () => {
    expect(sortEvents(null)).toEqual([])
    expect(sortEvents(undefined)).toEqual([])
    expect(sortEvents([])).toEqual([])
  })

  it('sorts events in chronological order across different timestamp types', () => {
    const list = [
      { id: '3', timestamp: '2026-03-01T12:00:00Z' },
      { id: '1', timestamp: { toMillis: () => 1000 } },
      { id: '4', timestamp: 1772366400000 + 5000 },
      { id: '2', timestamp: { seconds: 2 } }, // 2000 ms
    ]

    const sorted = sortEvents(list)
    expect(sorted.map(e => e.id)).toEqual(['1', '2', '3', '4'])
  })

  it('handles toDate(), Date objects, and invalid timestamps gracefully', () => {
    const list = [
      { id: 'valid-date', timestamp: new Date(2000) },
      { id: 'invalid-date', timestamp: 'not-a-date' },
      { id: 'to-date-obj', timestamp: { toDate: () => new Date(1000) } },
      { id: 'null-ts', timestamp: null },
    ]

    const sorted = sortEvents(list)
    // 0 millis come first: invalid-date, null-ts
    expect(sorted[2].id).toBe('to-date-obj')
    expect(sorted[3].id).toBe('valid-date')
  })
})

describe('formatEventDate', () => {
  it('returns empty string for null, undefined, or invalid timestamps', () => {
    expect(formatEventDate(null)).toBe('')
    expect(formatEventDate(undefined)).toBe('')
    expect(formatEventDate('invalid-date')).toBe('')
    expect(formatEventDate({})).toBe('')
  })

  it('formats Firestore Timestamp objects with toDate()', () => {
    const date = new Date(2026, 2, 15, 10, 30)
    const formatted = formatEventDate({ toDate: () => date })
    expect(formatted).toContain('2026')
    expect(formatted).toContain('10:30')
  })

  it('formats Date objects directly', () => {
    const date = new Date(2026, 4, 20, 14, 15)
    const formatted = formatEventDate(date)
    expect(formatted).toContain('2026')
    expect(formatted).toContain('2:15')
  })

  it('formats objects with seconds property', () => {
    const d = new Date(1773500000 * 1000)
    const formatted = formatEventDate({ seconds: 1773500000 })
    expect(formatted).toBe(
      d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    )
  })

  it('formats numeric timestamps and ISO strings', () => {
    const num = 1773500000000
    const str = new Date(num).toISOString()
    expect(formatEventDate(num)).not.toBe('')
    expect(formatEventDate(str)).toBe(formatEventDate(num))
  })
})

