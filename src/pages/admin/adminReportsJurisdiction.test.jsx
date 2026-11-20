// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rt = vi.hoisted(() => ({ subs: [], fetchAll: null, searchResults: [] }))

vi.mock('@/firebase/adminReportsQuery', () => ({
  REPORTS_PAGE_SIZE: 15,
  subscribeToReportsPage: vi.fn((options, handlers) => {
    const sub = { options, handlers, unsub: vi.fn() }
    rt.subs.push(sub)
    return sub.unsub
  }),
  fetchAllReportsForExport: vi.fn(async () => ({ docs: [], truncated: false })),
  fetchAllReportsForSearch: vi.fn(async () => rt.searchResults),
}))

vi.mock('@/firebase/services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({ exists: () => false })),
}))

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}))

vi.mock('react-hot-toast', () => {
  const toast = vi.fn()
  toast.success = vi.fn()
  toast.error = vi.fn()
  return { default: toast }
})

vi.mock('@/components/admin/BulkActionsToolbar', () => ({
  BulkActionsToolbar: () => null,
}))

vi.mock('@/utils/csv', async (original) => ({
  ...(await original()),
  downloadCsv: vi.fn(),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select
      data-testid="select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => (
    <option value={value}>{children ?? value}</option>
  ),
}))

import { AdminReportsPage } from './AdminReportsPage'

let container
let root

const ts = (d) => ({ toDate: () => d })

const makeComplaints = () => [
  {
    id: 'r1',
    complaintId: 'CMP-2026-0001',
    title: 'Pothole in Ward 1',
    status: 'Pending',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    address: 'Connaught Circle',
    wardId: 'WARD-01',
    ward: 'WARD-01',
    zoneName: 'New Delhi Central Zone (Zone A)',
    createdAt: ts(new Date(2026, 9, 1, 10)),
  },
  {
    id: 'r2',
    complaintId: 'CMP-2026-0002',
    title: 'Garbage in Ward 2',
    status: 'Pending',
    category: 'Garbage & Sanitation',
    department: 'Sanitation',
    address: 'Tilak Marg',
    wardId: 'WARD-02',
    ward: 'WARD-02',
    zoneName: 'East Civic Heritage Zone (Zone B)',
    createdAt: ts(new Date(2026, 9, 2, 10)),
  },
  {
    id: 'r3',
    complaintId: 'CMP-2026-0003',
    title: 'Streetlight in Ward 1',
    status: 'Resolved',
    category: 'Streetlight Issues',
    department: 'Electricity',
    address: 'Sansad Marg',
    wardId: 'WARD-01',
    ward: 'WARD-01',
    zoneName: 'New Delhi Central Zone (Zone A)',
    createdAt: ts(new Date(2026, 9, 3, 10)),
  },
  {
    id: 'r4',
    complaintId: 'CMP-2026-0004',
    title: 'Legacy issue with no ward metadata',
    status: 'Pending',
    category: 'Other',
    department: 'Roads',
    address: 'Unknown location',
    createdAt: ts(new Date(2026, 9, 4, 10)),
  },
]

async function renderPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <LanguageProvider>
        <AdminReportsPage />
      </LanguageProvider>
    )
  })
}

const latest = () => rt.subs[rt.subs.length - 1]

describe('AdminReportsPage Ward & Zone Jurisdiction Filtering (Issue #251)', () => {
  beforeEach(() => {
    rt.subs = []
  })

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders all complaints initially when ward and zone filters are "all"', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({ docs: makeComplaints(), hasMore: false, cursor: null })
    })

    const cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(4)
  })

  it('filters complaints by wardId when ward filter is selected', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({ docs: makeComplaints(), hasMore: false, cursor: null })
    })

    // Select elements order: status(0), department(1), category(2), sla(3), ward(4), zone(5)
    const selects = container.querySelectorAll('[data-testid="select"]')
    const wardSelect = selects[4]
    expect(wardSelect).toBeDefined()

    await act(async () => {
      wardSelect.value = 'WARD-01'
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(2)
    expect(cards[0].textContent).toContain('WARD-01')
    expect(cards[1].textContent).toContain('WARD-01')
  })

  it('filters complaints by zoneName when zone filter is selected', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({ docs: makeComplaints(), hasMore: false, cursor: null })
    })

    const selects = container.querySelectorAll('[data-testid="select"]')
    const zoneSelect = selects[5]
    expect(zoneSelect).toBeDefined()

    await act(async () => {
      zoneSelect.value = 'East Civic Heritage Zone (Zone B)'
      zoneSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toContain('WARD-02')
    expect(cards[0].textContent).toContain('Garbage in Ward 2')
  })

  it('combines ward filter with status and department filters', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({ docs: makeComplaints(), hasMore: false, cursor: null })
    })

    const selects = container.querySelectorAll('[data-testid="select"]')
    const statusSelect = selects[0]
    const wardSelect = selects[4]

    // Select status = Resolved
    await act(async () => {
      statusSelect.value = 'resolved'
      statusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // And Ward = WARD-01
    await act(async () => {
      wardSelect.value = 'WARD-01'
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Emit the resolved query page response matching status: 'Resolved'
    const currentSub = latest()
    expect(currentSub.options.status).toBe('resolved')
    await act(async () => {
      const resolvedDocs = makeComplaints().filter((c) => c.status === 'Resolved')
      currentSub.handlers.onPage({ docs: resolvedDocs, hasMore: false, cursor: null })
    })

    const cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toContain('Streetlight in Ward 1')
  })

  it('clearing ward filter restores all complaints without breaking pagination', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({ docs: makeComplaints(), hasMore: false, cursor: null })
    })

    const selects = container.querySelectorAll('[data-testid="select"]')
    const wardSelect = selects[4]

    await act(async () => {
      wardSelect.value = 'WARD-02'
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    let cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(1)

    // Clear filter
    await act(async () => {
      wardSelect.value = 'all'
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(4)
  })

  it('handles complaints with missing ward metadata safely without errors', async () => {
    await renderPage()
    const sub = latest()
    await act(async () => {
      sub.handlers.onPage({
        docs: [
          {
            id: 'legacy-null',
            complaintId: 'CMP-2026-9999',
            title: 'No ward field',
            status: 'Pending',
            category: 'Other',
            department: 'Roads',
            address: 'Unknown',
            wardId: null,
            ward: null,
            zoneName: null,
            createdAt: ts(new Date(2026, 9, 1)),
          },
        ],
        hasMore: false,
        cursor: null,
      })
    })

    const cards = container.querySelectorAll('.grid > .cursor-pointer')
    expect(cards).toHaveLength(1)
    expect(cards[0].textContent).toContain('No ward field')
  })
})
