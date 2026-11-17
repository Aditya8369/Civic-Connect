
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rt = vi.hoisted(() => ({ listeners: [], jobs: [] }))

vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('@/firebase/dashboardStats', () => ({
  DASHBOARD_WINDOW_SIZE: 200,
  startDashboardAggregates: vi.fn((handlers) => {
    const job = { handlers, refresh: vi.fn(), stop: vi.fn() }
    rt.jobs.push(job)
    return job
  }),
}))
vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  orderBy: (field, dir) => ({ kind: 'orderBy', field, dir }),
  limit: (n) => ({ kind: 'limit', n }),
  query: (col, ...constraints) => ({ col, constraints }),
  onSnapshot: vi.fn((q, onNext, onError) => {
    const l = { q, onNext, onError, unsub: vi.fn() }
    rt.listeners.push(l)
    return l.unsub
  }),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'admin-1' } }) }))
vi.mock('@/components/admin/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }))

import { AdminDashboardPage } from './AdminDashboardPage'

let container
let root

const doc = (id, data) => ({ id, data: () => data })

const windowDocs = [
  doc('a', { title: 'A', status: 'Pending', department: 'Roads', reportedBy: 'u1' }),
  doc('b', { title: 'B', status: 'Resolved', department: 'Water', reportedBy: 'u2' }),
]

const aggregates = {
  total: 1234,
  pending: 321,
  inProgress: 45,
  resolved: 868,
  ratedCount: 10,
  avgRating: 4.25,
  workload: [{ department: 'Sanitation', count: 77, isOverCapacity: true }],
}

beforeEach(async () => {
  rt.listeners = []
  rt.jobs = []

  localStorage.setItem('civic-connect-language', 'en')

  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <AdminDashboardPage />
      </LanguageProvider>
    )
  })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AdminDashboardPage data loading', () => {
  it('listens to a bounded, newest-first window instead of the whole collection', () => {
    expect(rt.listeners).toHaveLength(1)

    const { constraints } = rt.listeners[0].q

    expect(constraints).toContainEqual({
      kind: 'orderBy',
      field: 'createdAt',
      dir: 'desc',
    })

    expect(constraints).toContainEqual({
      kind: 'limit',
      n: 200,
    })
  })

  it('keeps real-time updates: each snapshot re-renders the list and asks aggregates to refresh', async () => {
    await act(async () => rt.listeners[0].onNext({ docs: windowDocs }))

    expect(container.textContent).toContain('A')
    expect(rt.jobs[0].refresh).toHaveBeenCalledTimes(1)

    await act(async () =>
      rt.listeners[0].onNext({
        docs: [
          doc('c', { title: 'Brand new report', status: 'Pending' }),
          ...windowDocs,
        ],
      })
    )

    expect(container.textContent).toContain('Brand new report')
    expect(rt.jobs[0].refresh).toHaveBeenCalledTimes(2)
  })

  it('shows whole-collection totals from aggregates, not the size of the window', async () => {
    await act(async () => rt.listeners[0].onNext({ docs: windowDocs }))
    await act(async () => rt.jobs[0].handlers.onData(aggregates))

    const text = container.textContent

    expect(text).toContain('1234')
    expect(text).toContain('868')
    expect(text).toContain('4.3 ★')
    expect(text).toContain('77 open tickets')
  })

  it('does not flash a partial window count as the total while aggregates are loading', async () => {
    await act(async () => rt.listeners[0].onNext({ docs: windowDocs }))

    const totalCard = [...container.querySelectorAll('p')].find(
      (p) => p.textContent === 'Total Complaints'
    )

    expect(totalCard.nextElementSibling.textContent).toBe('-')
  })

  it('falls back to window counts if the aggregate queries fail', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => rt.listeners[0].onNext({ docs: windowDocs }))
    await act(async () =>
      rt.jobs[0].handlers.onError(new Error('boom'))
    )

    const totalCard = [...container.querySelectorAll('p')].find(
      (p) => p.textContent === 'Total Complaints'
    )

    expect(totalCard.nextElementSibling.textContent).toBe('2')

    spy.mockRestore()
  })

  it('stops the listener and aggregate polling on unmount', async () => {
    await act(async () => root.unmount())

    expect(rt.listeners[0].unsub).toHaveBeenCalled()
    expect(rt.jobs[0].stop).toHaveBeenCalled()

    root = createRoot(container)
  })

  it('leaves the loading state (shows empty list) when the live listener errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await act(async () => rt.listeners[0].onError(new Error('denied')))

    expect(container.textContent).toContain('No reports submitted yet.')

    spy.mockRestore()
  })
})
