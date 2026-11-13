import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ counts: (/** @type {any} */ _q) => 0, ratings: { ratedCount: 0, avgRating: null } }))

vi.mock('./services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  where: (field, op, value) => ({ field, op, value }),
  query: (col, ...constraints) => ({ col, constraints }),
  count: () => ({ kind: 'count' }),
  average: (field) => ({ kind: 'average', field }),
  getCountFromServer: vi.fn(async (q) => ({ data: () => ({ count: fs.counts(q) }) })),
  getAggregateFromServer: vi.fn(async () => ({ data: () => fs.ratings })),
}))

import {
  DASHBOARD_WINDOW_SIZE,
  fetchDashboardAggregates,
  startDashboardAggregates,
} from './dashboardStats'

const key = (q) => (q.constraints || []).map((c) => `${c.field}${c.op}${JSON.stringify(c.value)}`).join('&')

describe('fetchDashboardAggregates', () => {
  beforeEach(() => {
    fs.ratings = { ratedCount: 0, avgRating: null }
  })

  it('uses server-side counts and keeps Reopened inside the pending figure', async () => {
    fs.counts = (q) =>
      ({
        '': 5000,
        'status=="Pending"': 120,
        'status=="Reopened"': 30,
        'status=="In Progress"': 400,
        'status=="Resolved"': 4300,
      })[key(q)] ?? 0
    const result = await fetchDashboardAggregates()
    expect(result).toMatchObject({ total: 5000, pending: 150, inProgress: 400, resolved: 4300 })
  })

  it('reports rating aggregates, or null when nothing is rated', async () => {
    fs.counts = () => 0
    fs.ratings = { ratedCount: 3, avgRating: 4.333 }
    expect(await fetchDashboardAggregates()).toMatchObject({ ratedCount: 3, avgRating: 4.333 })
    fs.ratings = { ratedCount: 0, avgRating: NaN }
    expect(await fetchDashboardAggregates()).toMatchObject({ ratedCount: 0, avgRating: null })
  })

  it('builds department workload from open-ticket counts, sorted, hiding empty departments, flagging > 20', async () => {
    fs.counts = (q) => {
      const dept = (q.constraints || []).find((c) => c.field === 'department')?.value
      return { Roads: 25, Water: 3, Sanitation: 25, Electricity: 0, 'Public Safety': 0 }[dept] ?? 0
    }
    const { workload } = await fetchDashboardAggregates()
    expect(workload).toEqual([
      { department: 'Roads', count: 25, isOverCapacity: true },
      { department: 'Sanitation', count: 25, isOverCapacity: true },
      { department: 'Water', count: 3, isOverCapacity: false },
    ])
  })

  it('caps the live window so the dashboard listener is never unbounded', () => {
    expect(DASHBOARD_WINDOW_SIZE).toBeGreaterThan(0)
    expect(DASHBOARD_WINDOW_SIZE).toBeLessThanOrEqual(500)
  })
})

describe('startDashboardAggregates', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('loads immediately, refreshes on an interval, and stops cleanly', async () => {
    const fetcher = vi.fn(async () => ({ total: 1 }))
    const onData = vi.fn()
    const job = startDashboardAggregates({ onData, onError: vi.fn() }, { fetcher, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    job.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('debounces refresh() calls from a burst of live updates into one fetch', async () => {
    const fetcher = vi.fn(async () => ({ total: 1 }))
    const job = startDashboardAggregates({ onData: vi.fn(), onError: vi.fn() }, { fetcher, intervalMs: 999999 })
    await vi.advanceTimersByTimeAsync(0)
    job.refresh()
    job.refresh()
    job.refresh()
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetcher).toHaveBeenCalledTimes(2)
    job.stop()
  })

  it('discards a slow response that was superseded by a newer request', async () => {
    const resolvers = []
    const fetcher = vi.fn(() => new Promise((r) => resolvers.push(r)))
    const onData = vi.fn()
    const job = startDashboardAggregates({ onData, onError: vi.fn() }, { fetcher, intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000) // second request starts
    resolvers[1]({ total: 2 })
    await vi.advanceTimersByTimeAsync(0)
    resolvers[0]({ total: 1 }) // stale
    await vi.advanceTimersByTimeAsync(0)
    expect(onData).toHaveBeenCalledTimes(1)
    expect(onData).toHaveBeenCalledWith({ total: 2 })
    job.stop()
  })

  it('ignores results after stop() and surfaces errors otherwise', async () => {
    const onError = vi.fn()
    const failing = startDashboardAggregates(
      { onData: vi.fn(), onError },
      { fetcher: vi.fn(async () => { throw new Error('boom') }), intervalMs: 999999 }
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledTimes(1)
    failing.stop()

    let resolve
    const onData = vi.fn()
    const job = startDashboardAggregates(
      { onData, onError: vi.fn() },
      { fetcher: () => new Promise((r) => (resolve = r)), intervalMs: 999999 }
    )
    job.stop()
    resolve({ total: 9 })
    await vi.advanceTimersByTimeAsync(0)
    expect(onData).not.toHaveBeenCalled()
  })
})
