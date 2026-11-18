// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AdminComplaintDetailsPage } from './AdminComplaintDetailsPage'
import * as complaintLifecycle from '@/firebase/complaintLifecycle'

const mockNavigate = vi.fn()
let mockComplaintData = null

const mockUser = {
  uid: 'admin-1',
  name: 'Admin Officer',
  email: 'admin@civic.gov',
  role: 'admin',
}

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'cmp-202' }),
  useNavigate: () => mockNavigate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: { uid: 'admin-1' } },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  getDoc: vi.fn((ref) => {
    if (typeof ref === 'string' && ref.startsWith('issues/')) {
      if (!mockComplaintData) {
        return Promise.resolve({ exists: () => false })
      }

      return Promise.resolve({
        id: 'cmp-202',
        exists: () => true,
        data: () => ({ ...mockComplaintData }),
      })
    }

    return Promise.resolve({
      exists: () => true,
      data: () => ({
        name: 'Reporter Citizen',
        email: 'reporter@civic.gov',
      }),
    })
  }),
  onSnapshot: vi.fn((ref, callback) => {
    if (typeof ref === 'string' && ref.includes('events')) {
      callback({ docs: [] })
    } else if (mockComplaintData) {
      callback({
        id: 'cmp-202',
        exists: () => true,
        data: () => mockComplaintData,
      })
    } else {
      callback({
        id: 'cmp-202',
        exists: () => false,
      })
    }
    return vi.fn()
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => 'SERVER_TIME',
}))

describe('Admin Complaint Details Dispute & Verification UI (#253)', () => {
  let container
  let root

  beforeEach(() => {
    mockComplaintData = {
      complaintId: 'CMP-2026-0202',
      title: 'Pothole on Main Market Road',
      description: 'Dangerous pothole outside vegetable market.',
      category: 'Potholes & Road Damage',
      department: 'Roads',
      status: 'Disputed',
      address: 'Shop 14, Main Market Road',
      reportedBy: 'citizen-1',
      imageUrl: 'https://storage/initial-pothole.jpg',
      resolutionNotes: 'Filled pothole with cold asphalt mix.',
      resolutionProof: {
        downloadUrl: 'https://storage/officer-pothole-repair.jpg',
        path: 'complaint-resolution-proof/cmp-202/repair.jpg',
      },
      dispute: {
        reason: 'POOR_QUALITY',
        explanation: 'The asphalt washed away after 2 hours of light drizzle; hole is wide open.',
        evidence: [
          {
            downloadUrl: 'https://storage/citizen-washed-out.jpg',
            contentType: 'image/jpeg',
          },
        ],
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

  it('renders 3-Way Evidence Comparison when status is Disputed', async () => {
    await act(async () => {
      root.render(<AdminComplaintDetailsPage />)
    })

    const text = container.textContent
    expect(text).toContain('Citizen Dispute Escalation Under Review')
    expect(text).toContain('3-Way Evidence Comparison')
    expect(text).toContain('1. Citizen Initial Photo')
    expect(text).toContain('2. Officer Resolution Proof')
    expect(text).toContain('3. Citizen Dispute Photo')
    expect(text).toContain('POOR_QUALITY')
  })

  it('renders Review Citizen Dispute action button and opens dialog', async () => {
    await act(async () => {
      root.render(<AdminComplaintDetailsPage />)
    })

    const reviewBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent.includes('Review Citizen Dispute') || b.textContent.includes('Take Dispute Decision')
    )
    expect(reviewBtns.length).toBeGreaterThan(0)

    await act(async () => {
      reviewBtns[0].click()
    })

    const dialogHeading = Array.from(document.querySelectorAll('h2, [role="heading"]')).find(
      (h) => h.textContent.includes('Admin Review of Citizen Dispute')
    )
    expect(dialogHeading).toBeTruthy()
    expect(document.body.textContent).toContain('Uphold Dispute')
    expect(document.body.textContent).toContain('Overrule / Reject Dispute')
  })

  it('calls reviewComplaintDispute when admin confirms dispute decision', async () => {
    const spyReview = vi.spyOn(complaintLifecycle, 'reviewComplaintDispute').mockResolvedValue({
      status: 'In Progress',
    })

    await act(async () => {
      root.render(<AdminComplaintDetailsPage />)
    })

    const reviewBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent.includes('Review Citizen Dispute') || b.textContent.includes('Take Dispute Decision')
    )
    await act(async () => {
      reviewBtns[0].click()
    })

    // Fill in admin remarks using React native setter
    const textarea = document.getElementById('dispute-admin-remarks')
    expect(textarea).toBeTruthy()
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set
      nativeSetter.call(
        textarea,
        'Site visit confirmed asphalt disintegrated. Field officer re-dispatch ordered.'
      )
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const confirmBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent.includes('Confirm Ruling')
    )
    expect(confirmBtn).toBeTruthy()

    await act(async () => {
      confirmBtn.click()
    })

    expect(spyReview).toHaveBeenCalledWith(
      'cmp-202',
      expect.objectContaining({
        decision: 'UPHOLD_DISPUTE',
        remarks: 'Site visit confirmed asphalt disintegrated. Field officer re-dispatch ordered.',
      }),
      expect.objectContaining({ role: 'admin' })
    )
  })
})
