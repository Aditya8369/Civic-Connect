import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ensureComplaintId, generateComplaintId, getDisplayId } from './complaintId'
import { createTransactionStore } from './testSupport/transactionStore'

const backend = vi.hoisted(() => ({ store: null }))
vi.mock('./services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...parts) => parts.join('/'),
  runTransaction: (...args) => backend.store.runTransaction(...args),
}))
const counter = 'counters/issueCounter'
const legacy = { status: 'Pending', description: 'Broken lamp', reportedBy: 'citizen', department: 'Electricity', updatedAt: 123 }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 3))
  backend.store = createTransactionStore({ 'issues/a': legacy })
})
afterEach(() => vi.useRealTimers())

it('initializes the counter and adds only the ticket ID to a legacy complaint', async () => {
  expect(await ensureComplaintId('a')).toBe('CMP-2026-0001')
  expect(backend.store.read('issues/a')).toEqual({ ...legacy, complaintId: 'CMP-2026-0001' })
  expect(backend.store.read(counter)).toEqual({ lastNumber: 1 })
})

it('returns an existing identifier without reading or incrementing the counter', async () => {
  backend.store.write('issues/a', { ...legacy, complaintId: 'CMP-2020-0042' })
  backend.store.history.length = 0
  expect(await ensureComplaintId('a')).toBe('CMP-2020-0042')
  expect(backend.store.read(counter)).toBeUndefined()
  expect(backend.store.history).toEqual([])
})

it.each([2, 5])('%i competing callers converge after actual read-version conflicts', async count => {
  const results = await Promise.all(Array.from({ length: count }, () => ensureComplaintId('a')))
  expect(new Set(results)).toEqual(new Set(['CMP-2026-0001']))
  expect(backend.store.read('issues/a').complaintId).toBe(results[0])
  expect(backend.store.read(counter).lastNumber).toBe(1)
  expect(backend.store.history.filter(write => write.key === 'issues/a')).toHaveLength(1)
  expect(backend.store.conflicts).toBeGreaterThan(0)
  expect(backend.store.attempts).toBeGreaterThan(count)
})

it('different legacy complaints allocate unique IDs despite counter contention', async () => {
  backend.store.write('issues/b', legacy)
  const results = await Promise.all([ensureComplaintId('a'), ensureComplaintId('b')])
  expect(new Set(results)).toEqual(new Set(['CMP-2026-0001', 'CMP-2026-0002']))
  expect(backend.store.read(counter).lastNumber).toBe(2)
  expect(backend.store.read('issues/a').complaintId).not.toBe(backend.store.read('issues/b').complaintId)
  expect(backend.store.conflicts).toBeGreaterThan(0)
})

it('retries when another actor assigns the ID before commit, preserving its exact ID', async () => {
  backend.store.beforeCommit = () => backend.store.write('issues/a', { ...legacy, complaintId: 'CMP-2026-0999' })
  expect(await ensureComplaintId('a')).toBe('CMP-2026-0999')
  expect(backend.store.read(counter)).toBeUndefined()
  expect(backend.store.attempts).toBe(2)
})

it('a metadata conflict reruns allocation without consuming an extra counter value', async () => {
  backend.store.beforeCommit = () => backend.store.write('issues/a', { ...legacy, status: 'In Progress' })
  expect(await ensureComplaintId('a')).toBe('CMP-2026-0001')
  expect(backend.store.attempts).toBe(2)
  expect(backend.store.read(counter).lastNumber).toBe(1)
  expect(backend.store.read('issues/a').status).toBe('In Progress')
})

it.each(['permission-denied', 'unavailable', 'aborted'])('rejects %s with neither document partially committed', async code => {
  backend.store.failCommit = new Error(code)
  await expect(ensureComplaintId('a')).rejects.toThrow(code)
  expect(backend.store.read('issues/a')).toEqual(legacy)
  expect(backend.store.read(counter)).toBeUndefined()
  expect(backend.store.history).toEqual([])
})

it('does not allocate for a missing complaint', async () => {
  await expect(ensureComplaintId('missing')).rejects.toThrow('Complaint no longer exists')
  expect(backend.store.history).toEqual([])
})

it('does not allocate when the complaint disappears during a retry', async () => {
  backend.store.beforeCommit = () => backend.store.remove('issues/a')
  await expect(ensureComplaintId('a')).rejects.toThrow('Complaint no longer exists')
  expect(backend.store.read(counter)).toBeUndefined()
  expect(backend.store.read('issues/a')).toBeUndefined()
})

it('shares counter semantics with normal generation, preserving counter metadata and ticket formatting', async () => {
  backend.store.write(counter, { lastNumber: 9999, label: 'global' })
  const results = await Promise.all([generateComplaintId(), ensureComplaintId('a')])
  expect(new Set(results)).toEqual(new Set(['CMP-2026-10000', 'CMP-2026-10001']))
  expect(backend.store.read(counter)).toEqual({ lastNumber: 10001, label: 'global' })
  expect(getDisplayId(backend.store.read('issues/a'))).toBe(results[1])
})

it('keeps the global counter continuous across years without renumbering an existing ID', async () => {
  const original = await ensureComplaintId('a')
  vi.setSystemTime(new Date(2027, 0, 1))
  expect(await ensureComplaintId('a')).toBe(original)
  expect(await generateComplaintId()).toBe('CMP-2027-0002')
})
