import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rt = vi.hoisted(() => ({ subs: [], fetchAll: null, searchResults: [] }))

vi.mock('@/firebase/adminReportsQuery', () => ({
  REPORTS_PAGE_SIZE: 15,
  subscribeToReportsPage: vi.fn((options, handlers) => {
    const sub = { options, handlers, unsub: vi.fn() }
    rt.subs.push(sub)
    return sub.unsub
  }),
  fetchAllReportsForExport: vi.fn((...args) => rt.fetchAll(...args)),
  fetchAllReportsForSearch: vi.fn(async () => rt.searchResults),
}))
vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'admin-1' } }) }))
vi.mock('react-hot-toast', () => {
  const toast = vi.fn()
  toast.success = vi.fn()
  toast.error = vi.fn()
  return { default: toast }
})
vi.mock('@/components/admin/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }))
vi.mock('@/utils/csv', async (original) => ({ ...(await original()), downloadCsv: vi.fn() }))
// Radix Select is not drivable in jsdom; a native <select> keeps the same value/onValueChange contract.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select data-testid="select" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value }) => <option value={value}>{value}</option>,
}))

import toast from 'react-hot-toast'
import { downloadCsv } from '@/utils/csv'
import { AdminReportsPage } from './AdminReportsPage'

const SELECT = { status: 0, department: 1, category: 2, sla: 3 }

let container
let root

const make = (n, start = 0, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${start + i}`,
    complaintId: `CMP-2026-${String(start + i).padStart(4, '0')}`,
    title: `Report ${start + i}`,
    status: 'Pending',
    category: 'Other',
    department: 'Roads',
    address: 'Main St',
    ...extra,
  }))

const latest = () => rt.subs[rt.subs.length - 1]
const page = (docs, { hasMore = false } = {}) => ({
  docs,
  hasMore,
  cursor: docs.length ? { cursorOf: docs[docs.length - 1].id } : null,
})
const emit = (sub, p) => act(async () => sub.handlers.onPage(p))
const el = (sel) => container.querySelector(sel)
const nextBtn = () => el('button[aria-label="Next page"]')
const prevBtn = () => el('button[aria-label="Previous page"]')
const cards = () => container.querySelectorAll('h3')
const click = (node) => act(async () => node.click())
const choose = (index, value) =>
  act(async () => {
    const select = container.querySelectorAll('[data-testid="select"]')[index]
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    setter.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })

beforeEach(async () => {
  rt.subs = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<AdminReportsPage />))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe('AdminReportsPage pagination', () => {
  it('subscribes to the first page without a cursor and shows a loading skeleton until data arrives', () => {
    expect(rt.subs).toHaveLength(1)
    expect(latest().options).toMatchObject({
      status: 'all',
      department: 'all',
      category: 'all',
      cursor: null,
    })
    expect(el('[aria-busy="true"]')).not.toBeNull()
  })

  it('renders at most 15 records; Previous is disabled on page 1', async () => {
    await emit(latest(), page(make(15), { hasMore: false }))
    expect(cards()).toHaveLength(15)
    expect(prevBtn().disabled).toBe(true)
  })

  it('exactly 15 records: Next is disabled', async () => {
    await emit(latest(), page(make(15), { hasMore: false }))
    expect(nextBtn().disabled).toBe(true)
  })

  it('more than 15 records: Next is enabled', async () => {
    await emit(latest(), page(make(15), { hasMore: true }))
    expect(nextBtn().disabled).toBe(false)
  })

  it('Next requests the following page using the last displayed document as cursor', async () => {
    const first = latest()
    const p1 = page(make(15), { hasMore: true })
    await emit(first, p1)

    await click(nextBtn())
    expect(first.unsub).toHaveBeenCalled()
    expect(rt.subs).toHaveLength(2)
    expect(latest().options.cursor).toBe(p1.cursor)

    // transition shows loading and disables both controls
    expect(el('[aria-busy="true"]')).not.toBeNull()
    expect(nextBtn().disabled).toBe(true)
    expect(prevBtn().disabled).toBe(true)

    await emit(latest(), page(make(4, 15), { hasMore: false }))
    expect(cards()).toHaveLength(4)
    expect(container.textContent).toContain('Page 2')
    expect(prevBtn().disabled).toBe(false)
    expect(nextBtn().disabled).toBe(true)
  })

  it('Previous returns to the earlier page via its stored cursor across several pages', async () => {
    const p1 = page(make(15), { hasMore: true })
    const p2 = page(make(15, 15), { hasMore: true })
    await emit(latest(), p1)
    await click(nextBtn())
    await emit(latest(), p2)
    await click(nextBtn())
    expect(latest().options.cursor).toBe(p2.cursor)
    await emit(latest(), page(make(3, 30)))

    await click(prevBtn())
    expect(latest().options.cursor).toBe(p1.cursor) // page 2 was fetched with p1's cursor
    await emit(latest(), p2)
    expect(container.textContent).toContain('Page 2')

    await click(prevBtn())
    expect(latest().options.cursor).toBe(null) // page 1 has no cursor
    await emit(latest(), p1)
    expect(container.textContent).toContain('Page 1')
    expect(prevBtn().disabled).toBe(true)
  })

  it('empty collection shows the empty state and no pagination controls', async () => {
    await emit(latest(), page([]))
    expect(container.textContent).toContain('No reports found')
    expect(nextBtn()).toBeNull()
    expect(prevBtn()).toBeNull()
  })
})

describe('AdminReportsPage server-side filters', () => {
  it('status filter is sent to the query', async () => {
    await emit(latest(), page(make(3)))
    await choose(SELECT.status, 'in-progress')
    expect(latest().options).toMatchObject({ status: 'in-progress', department: 'all', category: 'all', cursor: null })
  })

  it('department filter is sent to the query', async () => {
    await choose(SELECT.department, 'Water')
    expect(latest().options).toMatchObject({ status: 'all', department: 'Water', category: 'all' })
  })

  it('category filter is sent to the query', async () => {
    await choose(SELECT.category, 'Water Leakage')
    expect(latest().options).toMatchObject({ status: 'all', department: 'all', category: 'Water Leakage' })
  })

  it('combined filters are sent together', async () => {
    await choose(SELECT.status, 'resolved')
    await choose(SELECT.department, 'Roads')
    await choose(SELECT.category, 'Potholes & Road Damage')
    expect(latest().options).toMatchObject({
      status: 'resolved',
      department: 'Roads',
      category: 'Potholes & Road Damage',
      cursor: null,
    })
  })

  it('date range is sent to the query', async () => {
    const inputs = container.querySelectorAll('input[type="date"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    await act(async () => {
      setter.call(inputs[0], '2026-11-01')
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(latest().options.dateFrom).toBe('2026-11-01')
  })

  it('changing a filter on page 2 resets to page 1 and never reuses the old cursor', async () => {
    const p1 = page(make(15), { hasMore: true })
    await emit(latest(), p1)
    await click(nextBtn())
    expect(latest().options.cursor).toBe(p1.cursor)
    await emit(latest(), page(make(15, 15), { hasMore: true }))
    expect(container.textContent).toContain('Page 2')

    await choose(SELECT.status, 'pending')
    expect(latest().options).toMatchObject({ status: 'pending', cursor: null })
    await emit(latest(), page(make(2), { hasMore: false }))
    expect(container.textContent).toContain('Page 1')
    expect(prevBtn().disabled).toBe(true)

    // A later Next uses the NEW filter's cursor, not the previous filter's
    const filtered = page(make(15, 100, { status: 'Pending' }), { hasMore: true })
    await emit(latest(), filtered)
    await click(nextBtn())
    expect(latest().options.cursor).toBe(filtered.cursor)
    expect(latest().options.status).toBe('pending')
  })

  it('ignores a stale response that arrives after the filter changed', async () => {
    const stale = latest()
    await choose(SELECT.status, 'resolved')
    const fresh = latest()
    expect(stale.unsub).toHaveBeenCalled()

    await emit(fresh, page(make(2, 50, { status: 'Resolved' })))
    expect(cards()).toHaveLength(2)

    // old (unfiltered) response lands late and must not overwrite the filtered result
    await emit(stale, page(make(15, 0), { hasMore: true }))
    expect(cards()).toHaveLength(2)
    expect(container.textContent).toContain('Report 50')
    expect(nextBtn().disabled).toBe(true)
  })

  it('shows the filtered empty message when no report matches', async () => {
    await choose(SELECT.status, 'rejected')
    await emit(latest(), page([]))
    expect(container.textContent).toContain('No matching reports found')
  })
})

describe('AdminReportsPage client-side search and SLA', () => {
  it('searches all matching reports and paginates the complete result set', async () => {
    await emit(latest(), page([...make(1, 0, { title: 'Pothole near school' }), ...make(2, 1)], { hasMore: true }))
    rt.searchResults = [
      ...make(1, 0, { title: 'Pothole near school' }),
      ...make(15, 1),
      ...make(1, 16, { title: 'Another pothole' }),
    ]
    const input = el('input[aria-label="Search complaints"]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    vi.useFakeTimers()
    await act(async () => {
      setter.call(input, 'pothole')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => vi.advanceTimersByTime(300))
    vi.useRealTimers()
    expect(cards()).toHaveLength(2)
    expect(container.textContent).toContain('2 reports')
    expect(nextBtn().disabled).toBe(true)
  })
})

describe('AdminReportsPage errors', () => {
  it('shows the connection banner on a Firestore error and retry resubscribes', async () => {
    const sub = latest()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => sub.handlers.onError(new Error('unavailable')))
    expect(el('[role="alert"]')).not.toBeNull()
    expect(nextBtn()).toBeNull()

    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Retry'))
    await click(retry)
    expect(rt.subs).toHaveLength(2)
    expect(el('[role="alert"]')).toBeNull()
    spy.mockRestore()
  })

  it('does not report offline-empty as an error while online', async () => {
    await act(async () => latest().handlers.onOfflineEmpty())
    expect(el('[role="alert"]')).toBeNull()
  })
})

describe('AdminReportsPage export', () => {
  it('CSV export fetches every report matching the server-side filters, not just the visible page', async () => {
    await emit(latest(), page(make(15), { hasMore: true }))
    await choose(SELECT.status, 'pending')
    await emit(latest(), page(make(15), { hasMore: true }))
    rt.fetchAll = vi.fn(async () => ({ docs: make(40), truncated: false }))

    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Export to CSV'))
    await click(btn)

    expect(rt.fetchAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending', department: 'all', category: 'all' })
    )
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Exported 40 reports')
  })
})
