import { beforeEach, expect, it, vi } from 'vitest'
import { createTransactionStore } from './testSupport/transactionStore'
import { endorseComplaint } from './endorseComplaint'

const runtime = vi.hoisted(() => ({ store: null, auth: { currentUser: null } }))
vi.mock('./services', () => ({ db: {}, auth: runtime.auth }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: (...args) => runtime.store.runTransaction(...args),
  serverTimestamp: () => 'server-time',
}))

const path = 'issues/report-1'
const fixture = { endorsedBy: [], endorsementCount: 0, status: 'Pending', title: 'Lamp', updatedAt: 'old' }
beforeEach(() => {
  runtime.store = createTransactionStore({ [path]: fixture })
  runtime.auth.currentUser = { uid: 'citizen-1' }
})

it('counts two simultaneous endorsements by the same user once', async () => {
  const results = await Promise.all([
    endorseComplaint('report-1', 'citizen-1'),
    endorseComplaint('report-1', 'citizen-1'),
  ])
  expect(results.map(result => result.added).sort()).toEqual([false, true])
  expect(runtime.store.conflicts).toBe(1)
  expect(runtime.store.history).toHaveLength(1)
  expect(runtime.store.read(path)).toEqual({ ...fixture, endorsedBy: ['citizen-1'], endorsementCount: 1, updatedAt: 'server-time' })
})

it('counts different users after a conflicting transaction retries', async () => {
  runtime.store.beforeCommit = () => runtime.store.write(path, { ...fixture, endorsedBy: ['citizen-2'], endorsementCount: 1 })
  const result = await endorseComplaint('report-1', 'citizen-1')
  expect(runtime.store.conflicts).toBe(1)
  expect(result).toEqual({ added: true, endorsedBy: ['citizen-2', 'citizen-1'], endorsementCount: 2 })
  expect(runtime.store.read(path)).toEqual({ ...fixture, endorsedBy: ['citizen-2', 'citizen-1'], endorsementCount: 2, updatedAt: 'server-time' })
})

it('does not update the timestamp when an endorsement already exists', async () => {
  runtime.store = createTransactionStore({ [path]: { ...fixture, endorsedBy: ['citizen-1'], endorsementCount: 1 } })
  expect(await endorseComplaint('report-1', 'citizen-1')).toEqual({ added: false, endorsedBy: ['citizen-1'], endorsementCount: 1 })
  expect(runtime.store.history).toEqual([])
  expect(runtime.store.read(path).updatedAt).toBe('old')
})

it('supports older complaints without endorsement fields', async () => {
  runtime.store = createTransactionStore({ [path]: { title: 'Old complaint' } })
  await endorseComplaint('report-1', 'citizen-1')
  expect(runtime.store.read(path)).toEqual({ title: 'Old complaint', endorsedBy: ['citizen-1'], endorsementCount: 1, updatedAt: 'server-time' })
})

it('does not recreate a deleted complaint', async () => {
  runtime.store.remove(path)
  await expect(endorseComplaint('report-1', 'citizen-1')).rejects.toThrow('no longer exists')
  expect(runtime.store.read(path)).toBeUndefined()
})

it('does not write when the session changes during a retry', async () => {
  runtime.store.beforeCommit = () => {
    runtime.store.write(path, { ...fixture, title: 'New title' })
    runtime.auth.currentUser = { uid: 'citizen-1' }
  }
  await expect(endorseComplaint('report-1', 'citizen-1')).rejects.toThrow('session changed')
  expect(runtime.store.read(path)).toEqual({ ...fixture, title: 'New title' })
  expect(runtime.store.history).toHaveLength(1)
})

it('does not apply staged writes if the commit fails', async () => {
  runtime.store.failCommit = Object.assign(new Error('denied'), { code: 'permission-denied' })
  await expect(endorseComplaint('report-1', 'citizen-1')).rejects.toThrow('denied')
  expect(runtime.store.history).toEqual([])
  expect(runtime.store.read(path)).toEqual(fixture)
})
