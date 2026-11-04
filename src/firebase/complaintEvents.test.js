import { beforeEach, expect, it, vi } from 'vitest'
import { buildComplaintEvent, logComplaintEvent, addComplaintEventToBatch } from './complaintEvents'
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

