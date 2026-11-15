import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({
  snapshotHandlers: [],
  getDocsResults: [],
}))

vi.mock('./services', () => ({ db: { name: 'db' } }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ type: 'collection', name })),
  documentId: vi.fn(() => '__name__'),
  where: vi.fn((field, op, value) => ({ type: 'where', field, op, value })),
  orderBy: vi.fn((field, dir) => ({ type: 'orderBy', field, dir })),
  startAfter: vi.fn((cursor) => ({ type: 'startAfter', cursor })),
  limit: vi.fn((n) => ({ type: 'limit', n })),
  query: vi.fn((col, ...constraints) => ({ col, constraints })),
  Timestamp: { fromDate: (d) => ({ type: 'ts', ms: d.getTime() }) },
  onSnapshot: vi.fn((q, opts, onNext, onError) => {
    fs.snapshotHandlers.push({ q, opts, onNext, onError })
    return vi.fn()
  }),
  getDocs: vi.fn(async () => fs.getDocsResults.shift()),
}))

import {
  REPORTS_PAGE_SIZE,
  buildReportsPageConstraints,
  fetchAllReportsForExport,
  fetchAllReportsForSearch,
  subscribeToReportsPage,
} from './adminReportsQuery'

function fakeDocs(n, start = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `doc-${start + i}`,
    data: () => ({ title: `Report ${start + i}` }),
  }))
}
const snap = (docs, fromCache = false) => ({
  docs,
  empty: docs.length === 0,
  metadata: { fromCache },
})

beforeEach(() => {
  fs.snapshotHandlers = []
  fs.getDocsResults = []
})

describe('buildReportsPageConstraints', () => {
  it('orders by createdAt desc then document id desc and probes with pageSize + 1', () => {
    const c = buildReportsPageConstraints()
    expect(c).toEqual([
      { type: 'orderBy', field: 'createdAt', dir: 'desc' },
      { type: 'orderBy', field: '__name__', dir: 'desc' },
      { type: 'limit', n: REPORTS_PAGE_SIZE + 1 },
    ])
    expect(REPORTS_PAGE_SIZE).toBe(15)
  })

  it.each([
    [{ status: 'pending' }, [['status', '==', 'Pending']]],
    [{ status: 'in-progress' }, [['status', '==', 'In Progress']]],
    [{ status: 'merged - duplicate' }, [['status', '==', 'Merged - Duplicate']]],
    [{ department: 'Roads' }, [['department', '==', 'Roads']]],
    [{ category: 'Water Leakage' }, [['category', '==', 'Water Leakage']]],
    [
      { status: 'resolved', department: 'Water', category: 'Water Leakage' },
      [
        ['status', '==', 'Resolved'],
        ['department', '==', 'Water'],
        ['category', '==', 'Water Leakage'],
      ],
    ],
  ])('applies where() filters %j before ordering', (filters, expected) => {
    const c = buildReportsPageConstraints(filters)
    const wheres = c.filter((x) => x.type === 'where').map((x) => [x.field, x.op, x.value])
    expect(wheres).toEqual(expected)
    // every where() precedes orderBy / limit
    const firstOrder = c.findIndex((x) => x.type === 'orderBy')
    expect(c.slice(firstOrder).some((x) => x.type === 'where')).toBe(false)
  })

  it('does not constrain filters set to "all"', () => {
    const c = buildReportsPageConstraints({ status: 'all', department: 'all', category: 'all' })
    expect(c.some((x) => x.type === 'where')).toBe(false)
  })

  it('moves the date range server-side as inclusive createdAt bounds', () => {
    const c = buildReportsPageConstraints({ dateFrom: '2026-11-01', dateTo: '2026-11-05' })
    const from = c.find((x) => x.op === '>=')
    const to = c.find((x) => x.op === '<=')
    expect(from.field).toBe('createdAt')
    expect(from.value.ms).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).getTime())
    expect(to.value.ms).toBe(new Date(2026, 10, 5, 23, 59, 59, 999).getTime())
  })

  it('places startAfter(cursor) after ordering and before limit', () => {
    const cursor = { id: 'doc-14' }
    const c = buildReportsPageConstraints({ cursor })
    const types = c.map((x) => x.type)
    expect(types).toEqual(['orderBy', 'orderBy', 'startAfter', 'limit'])
    expect(c[2].cursor).toBe(cursor)
  })
})

describe('subscribeToReportsPage', () => {
  const handlers = () => ({ onPage: vi.fn(), onError: vi.fn(), onOfflineEmpty: vi.fn() })

  it('first page with more than 15 records: shows 15, reports hasMore, cursor is the 15th (not the probe)', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    fs.snapshotHandlers[0].onNext(snap(fakeDocs(16)))
    const page = h.onPage.mock.calls[0][0]
    expect(page.docs).toHaveLength(15)
    expect(page.docs[14].id).toBe('doc-14')
    expect(page.hasMore).toBe(true)
    expect(page.cursor.id).toBe('doc-14')
  })

  it('exactly 15 records: no next page', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    fs.snapshotHandlers[0].onNext(snap(fakeDocs(15)))
    const page = h.onPage.mock.calls[0][0]
    expect(page.docs).toHaveLength(15)
    expect(page.hasMore).toBe(false)
  })

  it('last page with fewer than 15 records', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    fs.snapshotHandlers[0].onNext(snap(fakeDocs(4)))
    const page = h.onPage.mock.calls[0][0]
    expect(page.docs).toHaveLength(4)
    expect(page.hasMore).toBe(false)
    expect(page.cursor.id).toBe('doc-3')
  })

  it('confirmed empty result', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    fs.snapshotHandlers[0].onNext(snap([]))
    expect(h.onPage).toHaveBeenCalledWith({ docs: [], cursor: null, hasMore: false })
  })

  it('treats an empty cache-only snapshot as unconfirmed, not as "no reports"', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    fs.snapshotHandlers[0].onNext(snap([], true))
    expect(h.onPage).not.toHaveBeenCalled()
    expect(h.onOfflineEmpty).toHaveBeenCalledTimes(1)
  })

  it('forwards Firestore errors', () => {
    const h = handlers()
    subscribeToReportsPage({}, h)
    const err = new Error('permission-denied')
    fs.snapshotHandlers[0].onError(err)
    expect(h.onError).toHaveBeenCalledWith(err)
  })

  it('keeps includeMetadataChanges and returns the unsubscribe function', () => {
    const unsub = subscribeToReportsPage({}, handlers())
    expect(fs.snapshotHandlers[0].opts).toEqual({ includeMetadataChanges: true })
    expect(typeof unsub).toBe('function')
  })

  it('reads only the issues collection with a bounded query', () => {
    subscribeToReportsPage({ status: 'pending', department: 'Roads' }, handlers())
    const { q } = fs.snapshotHandlers[0]
    expect(q.col).toEqual({ type: 'collection', name: 'issues' })
    expect(q.constraints.at(-1)).toEqual({ type: 'limit', n: 16 })
  })
})

describe('fetchAllReportsForExport', () => {
  it('pages through all matching documents using the last displayed doc as cursor', async () => {
    fs.getDocsResults = [snap(fakeDocs(4)), snap(fakeDocs(2, 3))] // batchSize 3 -> probe on first
    const { docs, truncated } = await fetchAllReportsForExport({ status: 'pending' }, { batchSize: 3 })
    expect(docs.map((d) => d.id)).toEqual(['doc-0', 'doc-1', 'doc-2', 'doc-3', 'doc-4'])
    expect(truncated).toBe(false)
  })

  it('stops at the safety cap and reports truncation', async () => {
    fs.getDocsResults = [snap(fakeDocs(4)), snap(fakeDocs(4, 3))]
    const { docs, truncated } = await fetchAllReportsForExport({}, { batchSize: 3, maxDocs: 6 })
    expect(docs).toHaveLength(6)
    expect(truncated).toBe(true)
  })
})

describe('fetchAllReportsForSearch', () => {
  it('reads every matching document without the export safety cap', async () => {
    fs.getDocsResults = [snap(fakeDocs(501)), snap(fakeDocs(2, 500))]
    const docs = await fetchAllReportsForSearch({}, { batchSize: 500 })

    expect(docs).toHaveLength(502)
    expect(docs.at(-1).id).toBe('doc-501')
  })
})
