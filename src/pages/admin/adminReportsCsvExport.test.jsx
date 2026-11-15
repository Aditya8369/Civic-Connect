// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const toast = vi.fn()
  toast.success = vi.fn()
  toast.error = vi.fn()

  return {
    subscribeToReportsPage: vi.fn(),
    fetchAllReportsForExport: vi.fn(),
    fetchAllReportsForSearch: vi.fn(),
    toCsv: vi.fn(() => 'csv-content'),
    downloadCsv: vi.fn(),
    formatDateStamp: vi.fn(() => '2026-11-13'),
    getDoc: vi.fn(),
    toast,
  }
})

vi.mock('@/firebase/services', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: mocks.getDoc,
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}))
vi.mock('react-hot-toast', () => ({ default: mocks.toast }))
vi.mock('@/firebase/adminReportsQuery', () => ({
  subscribeToReportsPage: mocks.subscribeToReportsPage,
  fetchAllReportsForExport: mocks.fetchAllReportsForExport,
  fetchAllReportsForSearch: mocks.fetchAllReportsForSearch,
  REPORTS_PAGE_SIZE: 10,
}))
vi.mock('@/utils/csv', () => ({
  toCsv: mocks.toCsv,
  downloadCsv: mocks.downloadCsv,
  formatDateStamp: mocks.formatDateStamp,
}))
vi.mock('@/components/admin/BulkActionsToolbar', () => ({
  BulkActionsToolbar: () => null,
}))

import { AdminReportsPage } from './AdminReportsPage'

const ts = (d) => ({ toDate: () => d })

const PAGE_DOCS = [
  {
    id: 'a',
    complaintId: 'CMP-2026-0001',
    title: 'Pothole on Main Rd',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    status: 'Pending',
    address: 'Main Rd',
    createdAt: ts(new Date(2026, 9, 1, 10)),
  },
  {
    id: 'b',
    complaintId: 'CMP-2026-0002',
    title: 'Garbage pile',
    category: 'Garbage & Sanitation',
    department: 'Sanitation',
    status: 'Resolved',
    address: 'Park St',
    createdAt: ts(new Date(2026, 9, 10, 10)),
  },
]

const EXPORT_DOCS = [
  ...PAGE_DOCS,
  {
    id: 'c',
    complaintId: 'CMP-2026-0003',
    title: 'Pothole near school',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    status: 'Resolved',
    address: 'School Ln',
    createdAt: ts(new Date(2026, 10, 5, 10)),
  },
]

let container
let root

async function renderPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(<AdminReportsPage />)
  })
}

const exportButton = () =>
  [...container.querySelectorAll('button')].find((button) =>
    button.textContent.includes('Export to CSV')
  )

async function setInput(element, value) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  ).set
  await act(async () => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const exportedRows = () => mocks.toCsv.mock.calls.at(-1)?.[1]

describe('AdminReportsPage - CSV export', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.clearAllMocks()

    mocks.subscribeToReportsPage.mockImplementation((_filters, handlers) => {
      handlers.onPage({
        docs: PAGE_DOCS,
        cursor: { id: 'b' },
        hasMore: false,
      })
      return vi.fn()
    })
    mocks.fetchAllReportsForExport.mockResolvedValue({
      docs: EXPORT_DOCS,
      truncated: false,
    })
    mocks.fetchAllReportsForSearch.mockResolvedValue(PAGE_DOCS)
    mocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('loads the first page with the default server filters', async () => {
    await renderPage()

    expect(mocks.subscribeToReportsPage).toHaveBeenCalledWith(
      {
        status: 'all',
        department: 'all',
        category: 'all',
        dateFrom: '',
        dateTo: '',
        cursor: null,
      },
      expect.any(Object)
    )
    expect(exportButton().disabled).toBe(false)
  })

  it('exports every matching report with the shared CSV helpers', async () => {
    await renderPage()

    await act(async () => exportButton().click())

    expect(mocks.fetchAllReportsForExport).toHaveBeenCalledWith({
      status: 'all',
      department: 'all',
      category: 'all',
      dateFrom: '',
      dateTo: '',
    })
    expect(mocks.toCsv).toHaveBeenCalledTimes(1)

    const [headers, rows] = mocks.toCsv.mock.calls[0]

    expect(headers).toContain('Tracking ID')
    expect(headers).toContain('Category')
    expect(headers).toContain('Department')
    expect(rows).toHaveLength(3)
    expect(rows[0][0]).toBe('CMP-2026-0001')
    expect(mocks.downloadCsv).toHaveBeenCalledWith(
      'civic-reports-2026-11-13.csv',
      'csv-content'
    )
    expect(mocks.toast.success).toHaveBeenCalledWith('Exported 3 reports')
  })

  it('applies the search client-side to the exported rows', async () => {
    await renderPage()

    await setInput(
      container.querySelector('input[aria-label="Search complaints"]'),
      'pothole'
    )
    await act(async () => {
      vi.advanceTimersByTime(250)
    })
    await act(async () => exportButton().click())

    expect(exportedRows().map((row) => row[0])).toEqual([
      'CMP-2026-0001',
      'CMP-2026-0003',
    ])
    expect(mocks.toast.success).toHaveBeenCalledWith('Exported 2 reports')
  })

  it('passes the date range to the export query', async () => {
    await renderPage()

    await setInput(
      container.querySelector('input[aria-label="From date"]'),
      '2026-10-05'
    )
    await setInput(
      container.querySelector('input[aria-label="To date"]'),
      '2026-10-31'
    )
    await act(async () => exportButton().click())

    expect(mocks.fetchAllReportsForExport).toHaveBeenCalledWith({
      status: 'all',
      department: 'all',
      category: 'all',
      dateFrom: '2026-10-05',
      dateTo: '2026-10-31',
    })
  })

  it('reports when no reports match the filters', async () => {
    mocks.fetchAllReportsForExport.mockResolvedValue({
      docs: [],
      truncated: false,
    })
    await renderPage()

    await act(async () => exportButton().click())

    expect(mocks.toast).toHaveBeenCalledWith(
      'No reports match the current filters'
    )
    expect(mocks.toCsv).not.toHaveBeenCalled()
    expect(mocks.downloadCsv).not.toHaveBeenCalled()
  })

  it('disables the button while the first page is still loading', async () => {
    mocks.subscribeToReportsPage.mockImplementation(() => vi.fn())
    await renderPage()

    expect(exportButton().disabled).toBe(true)
  })

  it('shows an error toast when the export throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.fetchAllReportsForExport.mockRejectedValue(new Error('blob failed'))
    await renderPage()

    await act(async () => exportButton().click())

    expect(mocks.toast.error).toHaveBeenCalledWith(
      'Could not export reports. Please try again.'
    )
    expect(mocks.toast.success).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
