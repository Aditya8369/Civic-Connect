// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  exportComplaintsToCSV: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'issues-collection'),
  query: vi.fn((...args) => args),
  orderBy: vi.fn(),
  onSnapshot: mocks.onSnapshot,
  doc: vi.fn(),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'admin-1' } }) }))
vi.mock('react-hot-toast', () => ({ default: mocks.toast }))
vi.mock('@/utils/csvExporter', () => ({ exportComplaintsToCSV: mocks.exportComplaintsToCSV }))
vi.mock('@/components/admin/BulkActionsToolbar', () => ({ BulkActionsToolbar: () => null }))

import { AdminReportsPage } from './AdminReportsPage'

const ts = (d) => ({ toDate: () => d })

const DOCS = [
  { id: 'a', complaintId: 'CMP-2026-0001', title: 'Pothole on Main Rd', category: 'Potholes & Road Damage', department: 'Roads', status: 'Pending', address: 'Main Rd', createdAt: ts(new Date(2026, 9, 1, 10)) },
  { id: 'b', complaintId: 'CMP-2026-0002', title: 'Garbage pile', category: 'Garbage & Sanitation', department: 'Sanitation', status: 'Resolved', address: 'Park St', createdAt: ts(new Date(2026, 9, 10, 10)) },
  { id: 'c', complaintId: 'CMP-2026-0003', title: 'Pothole near school', category: 'Potholes & Road Damage', department: 'Roads', status: 'Resolved', address: 'School Ln', createdAt: ts(new Date(2026, 10, 5, 10)) },
]

function snapshotOf(docs) {
  return {
    empty: docs.length === 0,
    metadata: { fromCache: false },
    docs: docs.map(({ id, ...data }) => ({ id, data: () => data })),
  }
}

let container
let root

async function renderPage(docs = DOCS) {
  mocks.onSnapshot.mockImplementation((_q, _opts, onNext) => {
    onNext(snapshotOf(docs))
    return () => {}
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<AdminReportsPage />)
  })
}

const exportButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Export CSV'))

async function setInput(el, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const exportedIds = () => mocks.exportComplaintsToCSV.mock.calls.at(-1)[0].map((c) => c.id)

describe('AdminReportsPage - CSV export', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    mocks.exportComplaintsToCSV.mockReturnValue(0)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('exports every complaint when no filter is applied, without extra Firestore reads', async () => {
    mocks.exportComplaintsToCSV.mockImplementation((list) => list.length)
    await renderPage()
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1)

    await act(async () => exportButton().click())

    expect(exportedIds()).toEqual(['a', 'b', 'c'])
    expect(mocks.toast.success).toHaveBeenCalledWith('Exported 3 reports')
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.getDocs).not.toHaveBeenCalled()
  })

  it('exports only the complaints matching the search filter', async () => {
    mocks.exportComplaintsToCSV.mockImplementation((list) => list.length)
    await renderPage()

    await setInput(container.querySelector('input[aria-label="Search complaints"]'), 'pothole')
    await act(async () => {
      vi.advanceTimersByTime(250) // search is debounced by 200ms
    })
    await act(async () => exportButton().click())

    expect(exportedIds()).toEqual(['a', 'c'])
    expect(mocks.toast.success).toHaveBeenCalledWith('Exported 2 reports')
    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1)
  })

  it('exports only the complaints inside the date range', async () => {
    mocks.exportComplaintsToCSV.mockImplementation((list) => list.length)
    await renderPage()

    await setInput(container.querySelector('input[aria-label="From date"]'), '2026-10-05')
    await setInput(container.querySelector('input[aria-label="To date"]'), '2026-10-31')
    await act(async () => exportButton().click())

    expect(exportedIds()).toEqual(['b'])
    expect(mocks.toast.success).toHaveBeenCalledWith('Exported 1 report')
  })

  it('combines filters (search + date range)', async () => {
    mocks.exportComplaintsToCSV.mockImplementation((list) => list.length)
    await renderPage()

    await setInput(container.querySelector('input[aria-label="Search complaints"]'), 'pothole')
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await setInput(container.querySelector('input[aria-label="From date"]'), '2026-11-01')
    await act(async () => exportButton().click())

    expect(exportedIds()).toEqual(['c'])
  })

  it('has an accessible name that contains the visible label and reports the count', async () => {
    await renderPage()
    const label = exportButton().getAttribute('aria-label')
    expect(label).toContain('Export CSV')
    expect(label).toContain('3 filtered reports')
  })

  it('disables the button when no complaints match the filters', async () => {
    await renderPage()
    await setInput(container.querySelector('input[aria-label="Search complaints"]'), 'zzz-no-match')
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    expect(exportButton().disabled).toBe(true)
    expect(exportButton().getAttribute('aria-label')).toContain('0 filtered reports')

    await act(async () => exportButton().click())
    expect(mocks.exportComplaintsToCSV).not.toHaveBeenCalled()
  })

  it('disables the button while complaints are still loading', async () => {
    mocks.onSnapshot.mockImplementation(() => () => {}) // never delivers a snapshot
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(<AdminReportsPage />))
    expect(exportButton().disabled).toBe(true)
  })

  it('shows an error toast when the export throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.exportComplaintsToCSV.mockImplementation(() => {
      throw new Error('blob failed')
    })
    await renderPage()
    await act(async () => exportButton().click())

    expect(mocks.toast.error).toHaveBeenCalledWith('Could not generate the CSV. Please try again.')
    expect(mocks.toast.success).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
