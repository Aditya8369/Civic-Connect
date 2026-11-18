// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ComplaintDetailsPage } from './ComplaintDetailsPage'
import * as complaintLifecycle from '@/firebase/complaintLifecycle'

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

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: vi.fn(async (id) => id),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  getDoc: vi.fn((ref) => {
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

describe('Citizen Complaint Verification & Dispute UI (#253)', () => {
  let container
  let root

  beforeEach(() => {
    mockComplaintData = {
      complaintId: 'CMP-2026-0888',
      title: 'Broken Stormwater Drain Cover',
      description: 'The drain slab is broken and poses immediate risk during rain.',
      category: 'Water Leakage',
      department: 'Stormwater Drainage',
      status: 'Pending Verification',
      address: '12th Main Rd, 4th Block, Koramangala',
      reportedBy: 'citizen-1',
      resolutionNotes: 'Replaced broken slab with reinforced concrete grate.',
      resolutionProof: {
        downloadUrl: 'https://storage/resolution.jpg',
        path: 'complaint-resolution-proof/cmp-101/resolution.jpg',
      },
      verificationDeadline: {
        toDate: () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days remaining
      },
      createdAt: { toDate: () => new Date(2026, 10, 11, 10, 0) },
      updatedAt: { toDate: () => new Date(2026, 10, 11, 11, 0) },
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders "Resolution Verification Required" card and action buttons when status is Pending Verification', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const text = container.textContent
    expect(text).toContain('Resolution Verification Required')
    expect(text).toContain('Review window:')
    expect(text).toContain('Accept Resolution')
    expect(text).toContain('Dispute Resolution')
  })

  it('renders Under Verification step on status stepper', async () => {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const text = container.textContent
    expect(text).toContain('Under Verification')
  })

  it('renders dispute escalation notice when complaint status is Disputed', async () => {
    mockComplaintData.status = 'Disputed'
    mockComplaintData.dispute = {
      reason: 'WORK_INCOMPLETE',
      explanation: 'Slab installed unevenly and rainwater is overflowing.',
    }

    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    const text = container.textContent
    expect(text).toContain('Resolution Under Administrative Dispute Review')
    expect(text).toContain('WORK_INCOMPLETE')
    expect(text).toContain('Slab installed unevenly and rainwater is overflowing.')
  })

  it('calls acceptComplaintResolution when citizen confirms resolution dialog', async () => {
    const spyAccept = vi.spyOn(complaintLifecycle, 'acceptComplaintResolution').mockResolvedValue({
      status: 'Resolved',
    })

    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })

    // Click "Accept Resolution" button
    const acceptBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent.includes('Accept Resolution')
    )
    expect(acceptBtns.length).toBeGreaterThan(0)

    await act(async () => {
      acceptBtns[0].click()
    })

    // Confirm in dialog
    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.includes('Confirm Resolution')
    )
    expect(confirmBtn).toBeTruthy()

    await act(async () => {
      confirmBtn.click()
    })

    expect(spyAccept).toHaveBeenCalledWith(
      'cmp-101',
      { uid: 'citizen-1', role: 'citizen' },
      expect.objectContaining({ rating: 5 })
    )
  })
})
