import { beforeEach, expect, it, vi } from 'vitest'
import { createTransactionStore } from './testSupport/transactionStore'
import { mergeComplaints } from './complaintMerge'

const runtime = vi.hoisted(() => ({ store: null, counter: 0 }))
vi.mock('./services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => parts.length ? parts.join('/') : ref + '/' + ++runtime.counter,
  collection: (_db, name) => name,
  runTransaction: (db, callback) =>
    runtime.store.runTransaction(db, tx => callback({
      ...tx,
      get: async key => {
        const snap = await tx.get(key)
        return { exists: () => snap.exists(), data: () => snap.data() }
      },
    })),
  serverTimestamp: () => 'server-time',
  arrayUnion: (...items) => items,
}))

const childPath = 'issues/child-1'
const parentPath = 'issues/parent-1'

const childFixture = {
  complaintId: 'CMP-2026-0002',
  title: 'Water pipe leak on 5th Ave',
  status: 'Pending',
  reportedBy: 'citizen-child',
  endorsedBy: ['citizen-a', 'citizen-shared'],
  endorsementCount: 2,
  createdAt: '2026-01-01',
  updatedAt: 'old-time',
}

const parentFixture = {
  complaintId: 'CMP-2026-0001',
  title: 'Major main burst 5th Ave',
  status: 'In Progress',
  reportedBy: 'citizen-parent',
  endorsedBy: ['citizen-shared', 'citizen-b'],
  endorsementCount: 2,
  mergedChildIds: [],
  createdAt: '2026-01-01',
  updatedAt: 'old-time',
}

beforeEach(() => {
  runtime.counter = 0
  runtime.store = createTransactionStore({
    [childPath]: structuredClone(childFixture),
    [parentPath]: structuredClone(parentFixture),
  })
})

it('atomically merges child complaint into parent with deduplicated endorsers, audit trails, and citizen notification', async () => {
  const result = await mergeComplaints({
    childId: 'child-1',
    parentId: 'parent-1',
    actorUid: 'admin-42',
    expectedChildStatus: 'Pending',
  })

  expect(result.success).toBe(true)
  expect(result.parentComplaintId).toBe('CMP-2026-0001')

  // 1. Verify child complaint document
  const updatedChild = runtime.store.read(childPath)
  expect(updatedChild.status).toBe('Merged - Duplicate')
  expect(updatedChild.mergedInto).toBe('CMP-2026-0001')
  expect(updatedChild.mergedIntoId).toBe('parent-1')
  expect(updatedChild.mergedBy).toBe('admin-42')
  expect(updatedChild.updatedAt).toBe('server-time')

  // 2. Verify parent complaint document
  const updatedParent = runtime.store.read(parentPath)
  expect(updatedParent.mergedChildIds).toEqual(['child-1'])
  expect(updatedParent.mergedChildComplaintIds).toEqual(['CMP-2026-0002'])
  // 'citizen-shared' was in both, so deduplicated endorsers should have length 3
  expect(updatedParent.endorsedBy).toEqual(['citizen-shared', 'citizen-b', 'citizen-a'])
  expect(updatedParent.endorsementCount).toBe(3)
  expect(updatedParent.updatedAt).toBe('server-time')

  // 3. Verify audit events
  const childEvents = runtime.store.history
    .filter(e => e.key.startsWith('issues/child-1/events/'))
    .map(e => e.data)
  expect(childEvents).toHaveLength(1)
  expect(childEvents[0]).toMatchObject({
    actorUid: 'admin-42',
    action: 'Complaint merged',
    previousStatus: 'Pending',
    newStatus: 'Merged - Duplicate',
    remarks: 'Merged into complaint CMP-2026-0001',
  })

  const parentEvents = runtime.store.history
    .filter(e => e.key.startsWith('issues/parent-1/events/'))
    .map(e => e.data)
  expect(parentEvents).toHaveLength(1)
  expect(parentEvents[0]).toMatchObject({
    actorUid: 'admin-42',
    action: 'Duplicate complaint consolidated',
    previousStatus: 'In Progress',
    newStatus: 'In Progress',
    remarks: 'Consolidated duplicate complaint CMP-2026-0002',
  })

  // 4. Verify citizen notification
  const notifications = runtime.store.history
    .filter(e => e.key.startsWith('notifications/'))
    .map(e => e.data)
  expect(notifications).toHaveLength(1)
  expect(notifications[0]).toMatchObject({
    recipientUid: 'citizen-child',
    recipientRole: 'citizen',
    senderUid: 'admin-42',
    issueId: 'CMP-2026-0001',
    type: 'status_update',
    title: 'Complaint Merged',
    message: 'Your complaint has been consolidated with ticket CMP-2026-0001 and will be tracked jointly.',
  })
})

it('rejects self-merge when childId equals parentId', async () => {
  await expect(
    mergeComplaints({ childId: 'ticket-1', parentId: 'ticket-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Cannot merge a complaint into itself')
})

it('rejects merge if child complaint does not exist', async () => {
  await expect(
    mergeComplaints({ childId: 'non-existent', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Child complaint no longer exists')
})

it('rejects merge if parent complaint does not exist', async () => {
  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'non-existent', actorUid: 'admin-1' })
  ).rejects.toThrow('Parent complaint no longer exists')
})

it('rejects circular merge when parent is already marked as duplicate', async () => {
  runtime.store.write(parentPath, {
    ...parentFixture,
    status: 'Merged - Duplicate',
    mergedInto: 'CMP-2026-0099',
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Cannot merge into a complaint that is already marked as duplicate')
})

it('rejects merge when child is already marked as duplicate', async () => {
  runtime.store.write(childPath, {
    ...childFixture,
    status: 'Merged - Duplicate',
    mergedInto: 'CMP-2026-0001',
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Complaint is already merged')
})

it('rejects circular merge when parent was previously merged into child', async () => {
  runtime.store.write(parentPath, {
    ...parentFixture,
    mergedInto: 'CMP-2026-0002',
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Circular merge detected')
})

it('rejects circular merge when child has parent in mergedChildIds', async () => {
  runtime.store.write(childPath, {
    ...childFixture,
    mergedChildIds: ['parent-1'],
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Circular merge detected')
})

it('rejects merge if target parent is rejected', async () => {
  runtime.store.write(parentPath, {
    ...parentFixture,
    status: 'Rejected',
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Cannot merge into a rejected complaint')
})

it('aborts transaction when child status changes concurrently and expectedChildStatus is specified', async () => {
  await expect(
    mergeComplaints({
      childId: 'child-1',
      parentId: 'parent-1',
      actorUid: 'admin-1',
      expectedChildStatus: 'In Progress', // actual is 'Pending'
    })
  ).rejects.toThrow(/Child complaint status changed from In Progress to Pending/)

  // Verify no writes were committed
  expect(runtime.store.read(childPath).status).toBe('Pending')
  expect(runtime.store.read(parentPath).mergedChildIds).toEqual([])
})

it('rolls back and applies zero mutations if the transaction commit fails', async () => {
  runtime.store.failCommit = Object.assign(new Error('Transaction commit error'), {
    code: 'aborted',
  })

  await expect(
    mergeComplaints({ childId: 'child-1', parentId: 'parent-1', actorUid: 'admin-1' })
  ).rejects.toThrow('Transaction commit error')

  expect(runtime.store.read(childPath)).toEqual(childFixture)
  expect(runtime.store.read(parentPath)).toEqual(parentFixture)
})

it('inherits existing child tickets if child being merged previously consolidated other duplicates', async () => {
  runtime.store.write(childPath, {
    ...childFixture,
    mergedChildIds: ['grandchild-1'],
    mergedChildComplaintIds: ['CMP-2026-0003'],
  })

  await mergeComplaints({
    childId: 'child-1',
    parentId: 'parent-1',
    actorUid: 'admin-1',
  })

  const updatedParent = runtime.store.read(parentPath)
  expect(updatedParent.mergedChildIds).toEqual(['child-1', 'grandchild-1'])
  expect(updatedParent.mergedChildComplaintIds).toEqual(['CMP-2026-0002', 'CMP-2026-0003'])
})

it('uses parentId if parent does not have a custom complaintId assigned', async () => {
  runtime.store.write(parentPath, {
    ...parentFixture,
    complaintId: null,
  })

  await mergeComplaints({
    childId: 'child-1',
    parentId: 'parent-1',
    actorUid: 'admin-1',
  })

  const updatedChild = runtime.store.read(childPath)
  expect(updatedChild.mergedInto).toBe('parent-1')
})


