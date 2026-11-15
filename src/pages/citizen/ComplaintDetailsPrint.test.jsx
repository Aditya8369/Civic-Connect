// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ComplaintDetailsPage } from './ComplaintDetailsPage'

const mockNavigate = vi.fn()
let mockComplaintData = null

const mockUser = {
  uid: 'citizen-1',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  role: 'citizen',
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'cmp-101' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: { uid: 'citizen-1' } },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  getDoc: vi.fn((ref) => {
    // The complaint reference is resolved before the page subscribes.
    if (typeof ref === 'string' && ref.startsWith('issues/')) {
      if (!mockComplaintData) {
        return Promise.resolve({ exists: () => false })
      }

      return Promise.resolve({
        id: 'cmp-101',
        exists: () => true,
        data: () => ({ ...mockComplaintData, reportedBy: 'citizen-1' }),
      })
    }

    return Promise.resolve({
      exists: () => true,
      data: () => ({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        phone: '+91 91234 56789',
        address: '12th Main Road, Koramangala',
      }),
    })
  }),
  onSnapshot: vi.fn((ref, callback) => {
    // If it's the events subcollection
    if (typeof ref === 'string' && ref.includes('events')) {
      callback({ docs: [] })
    } else if (mockComplaintData) {
      callback({
        id: 'cmp-101',
        exists: () => true,
        data: () => mockComplaintData,
      })
    } else {
      callback({
        id: 'cmp-101',
        exists: () => false,
      })
    }
    return vi.fn()
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => 'SERVER_TIME',
}))

describe('ComplaintDetailsPage Print Integration (#161)', () => {
  let container
  let root
  let originalPrint

  beforeEach(() => {
    originalPrint = window.print
    window.print = vi.fn()

    mockComplaintData = {
      complaintId: 'CMP-2026-0888',
      title: 'Broken Stormwater Drain Cover',
      description: 'The drain slab is broken and poses immediate risk during rain.',
      category: 'Water Leakage',
      department: 'Stormwater Drainage',
      status: 'In Progress',
      address: '12th Main Rd, 4th Block, Koramangala',
      reportedBy: 'citizen-1',
      createdAt: { toDate: () => new Date(2026, 10, 11, 10, 0) },
      updatedAt: { toDate: () => new Date(2026, 10, 11, 11, 0) },
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      if (root) root.unmount()
    })
    container.remove()
    window.print = originalPrint
    vi.clearAllMocks()
  })

  it('renders "Print Official Receipt" button with printer icon when complaint is loaded', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const printButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('Print Official Receipt')
    )

    expect(printButton).toBeTruthy()
    expect(printButton.innerHTML).toContain('Print Official Receipt')
    // Printer icon SVG should be inside button
    expect(printButton.querySelector('svg')).toBeTruthy()
  }, 20000)

  it('clicking "Print Official Receipt" button triggers native window.print()', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const printButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('Print Official Receipt')
    )
    expect(printButton).toBeTruthy()

    await act(async () => {
      printButton.click()
    })

    expect(window.print).toHaveBeenCalledTimes(1)
  }, 20000)

  it('renders dedicated print-only container with PrintableGrievanceReceipt', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const printWrapper = container.querySelector('.printable-receipt-wrapper')
    expect(printWrapper).toBeTruthy()
    expect(printWrapper.className).toContain('hidden')
    expect(printWrapper.className).toContain('print:block')

    // The receipt component inside print container
    const receipt = printWrapper.querySelector('[data-testid="printable-grievance-receipt"]')
    expect(receipt).toBeTruthy()
    expect(receipt.textContent).toContain('MUNICIPAL GRIEVANCE RECEIPT')
    expect(receipt.textContent).toContain('CMP-2026-0888')
    expect(receipt.textContent).toContain('Broken Stormwater Drain Cover')
    expect(receipt.textContent).toContain('Stormwater Drainage')
    expect(receipt.textContent).toContain('IN PROGRESS')
  }, 20000)

  it('wraps normal interactive controls in print:hidden so they remain available on screen but hidden in print', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const screenContainer = container.querySelector('.print\\:hidden')
    expect(screenContainer).toBeTruthy()

    // Back to My Reports button is inside screen-only container
    const backBtn = screenContainer.querySelector('button')
    expect(backBtn.textContent).toContain('Back to My Reports')

    // Status Timeline is inside screen container
    expect(screenContainer.textContent).toContain('Status Timeline')
  }, 20000)

  it('does not display print button when complaint is not found', async () => {
    mockComplaintData = null

    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const printButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('Print Official Receipt')
    )
    expect(printButton).toBeFalsy()
    expect(container.textContent).toContain('Complaint not found')
  }, 20000)
})
