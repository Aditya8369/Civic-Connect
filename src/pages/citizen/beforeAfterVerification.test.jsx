// @vitest-environment jsdom
globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ComplaintDetailsPage } from './ComplaintDetailsPage'

const runtime = vi.hoisted(() => ({
  complaint: null,
  navigate: vi.fn(),
  user: {
    uid: 'citizen-verifier-1',
    name: 'Citizen Verifier',
    email: 'citizen@example.com',
    role: 'citizen',
  },
  commitComplaintTransition: vi.fn(async () => {}),
  acceptComplaintResolution: vi.fn(async () => {}),
  disputeComplaintResolution: vi.fn(async () => {}),
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => runtime.navigate,
  useParams: () => ({ id: 'CMP-2026-7777' }),
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.user }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: runtime.user },
}))

vi.mock('@/firebase/complaintLifecycle', () => ({
  commitComplaintTransition: runtime.commitComplaintTransition,
  acceptComplaintResolution: runtime.acceptComplaintResolution,
  disputeComplaintResolution: runtime.disputeComplaintResolution,
  DISPUTE_REASONS: ['WORK_INCOMPLETE', 'INCORRECT_LOCATION', 'POOR_QUALITY', 'OTHER'],
}))

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: async (issueId) => issueId,
}))

vi.mock('@/firebase/complaintId', () => ({
  getDisplayId: () => 'CMP-2026-7777',
}))

vi.mock('@/firebase/complaintEvents', () => ({
  sortEvents: vi.fn((evts) => evts),
  formatEventDate: vi.fn(() => 'Nov 24, 2026'),
}))

vi.mock('@/components/common/SlaBadge', () => ({
  SlaBadge: () => null,
  SlaCountdown: () => null,
}))

vi.mock('@/components/citizen/MilestoneCelebrationBanner', () => ({
  MilestoneCelebrationBanner: () => null,
}))

vi.mock('@/components/citizen/ComplaintAudioPlayer', () => ({
  default: () => null,
}))

vi.mock('@/components/chat/ResolutionChatDrawer', () => ({
  ResolutionChatDrawer: () => null,
}))

vi.mock('@/components/common/ComplaintLocationMap', () => ({
  ComplaintLocationMap: () => <div data-testid="mock-location-map" />,
}))

vi.mock('@/components/citizen/ResolutionFeedback', () => ({
  ResolutionFeedback: ({ issueId, feedback }) => (
    <div data-testid="mock-resolution-feedback">
      {feedback ? 'Feedback Submitted' : <button type="button">Leave feedback</button>}
    </div>
  ),
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ name: 'Citizen Verifier', email: 'citizen@example.com' }),
  })),
  serverTimestamp: () => 'SERVER_TIME',
  onSnapshot: vi.fn((ref, callback) => {
    if (typeof ref === 'string' && ref.includes('events')) {
      callback({ docs: [] })
    } else {
      callback({
        id: 'CMP-2026-7777',
        exists: () => Boolean(runtime.complaint),
        data: () => runtime.complaint,
      })
    }
    return vi.fn()
  }),
}))

describe('Before & After Visual Verification & 48h Dispute Window', () => {
  let container
  let root

  beforeEach(() => {
    runtime.complaint = null
    vi.clearAllMocks()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    container = null
    root = null
    runtime.complaint = null
  })

  it('renders side-by-side Before & After comparison slider with both photos', async () => {
    runtime.complaint = {
      complaintId: 'CMP-2026-7777',
      title: 'Pothole repaired on 4th cross',
      status: 'Resolved',
      reportedBy: 'citizen-verifier-1',
      imageUrl: 'https://storage.googleapis.com/test-bucket/before-pothole.jpg',
      resolutionProof: {
        downloadUrl: 'https://storage.googleapis.com/test-bucket/after-patch.jpg',
      },
      resolvedAt: {
        toDate: () => new Date(Date.now() - 5 * 60 * 60 * 1000), // 5 hours ago
      },
      createdAt: {
        toDate: () => new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
    }

    await act(async () => {
      root.render(
        <LanguageProvider>
          <ComplaintDetailsPage />
        </LanguageProvider>
      )
    })

    // Expect Before & After header
    expect(container.textContent).toContain('Before & After Visual Verification')
    expect(container.textContent).toContain('Interactive comparison')

    // Expect resolution proof slider to be rendered
    const slider = container.querySelector('[data-testid="resolution-proof-slider"]')
    expect(slider).not.toBeNull()
    expect(slider.textContent).toContain('Before')
    expect(slider.textContent).toContain('After')
  })

  it('prompts the citizen for a 1-5 star satisfaction rating when resolved without feedback', async () => {
    runtime.complaint = {
      complaintId: 'CMP-2026-7777',
      title: 'Pothole repaired on 4th cross',
      status: 'Resolved',
      reportedBy: 'citizen-verifier-1',
      imageUrl: 'https://storage.googleapis.com/test-bucket/before-pothole.jpg',
      resolvedAt: {
        toDate: () => new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    }

    await act(async () => {
      root.render(
        <LanguageProvider>
          <ComplaintDetailsPage />
        </LanguageProvider>
      )
    })

    // Expect satisfaction rating prompt banner
    const promptBanner = container.querySelector('[data-testid="satisfaction-rating-prompt"]')
    expect(promptBanner).not.toBeNull()
    expect(promptBanner.textContent).toContain('Rate Your Resolution')
    expect(promptBanner.textContent).toContain('1–5 stars')
  })

  it('enforces 48-hour Dispute Resolution window for reopening tickets', async () => {
    // Ticket resolved 10 hours ago -> eligible to dispute & reopen with remaining hours
    runtime.complaint = {
      complaintId: 'CMP-2026-7777',
      title: 'Water pipe fix',
      status: 'Resolved',
      reportedBy: 'citizen-verifier-1',
      resolvedAt: {
        toDate: () => new Date(Date.now() - 10 * 60 * 60 * 1000), // 10h ago
      },
    }

    await act(async () => {
      root.render(
        <LanguageProvider>
          <ComplaintDetailsPage />
        </LanguageProvider>
      )
    })

    const disputeBtn = container.querySelector('[data-testid="dispute-reopen-btn"]')
    expect(disputeBtn).not.toBeNull()
    expect(disputeBtn.textContent).toContain('Dispute Resolution')
    expect(disputeBtn.textContent).toContain('38h left')

    // Click dispute & reopen button to check modal
    await act(async () => {
      disputeBtn.click()
    })

    expect(document.body.textContent).toContain('Dispute Resolution & Reopen Issue')
    expect(document.body.textContent).toContain('48-hour Dispute Resolution window')
  })

  it('disables dispute reopen button when 48-hour window has expired', async () => {
    // Ticket resolved 50 hours ago -> past 48h dispute window
    runtime.complaint = {
      complaintId: 'CMP-2026-7777',
      title: 'Water pipe fix',
      status: 'Resolved',
      reportedBy: 'citizen-verifier-1',
      resolvedAt: {
        toDate: () => new Date(Date.now() - 50 * 60 * 60 * 1000), // 50h ago
      },
    }

    await act(async () => {
      root.render(
        <LanguageProvider>
          <ComplaintDetailsPage />
        </LanguageProvider>
      )
    })

    const disputeBtn = container.querySelector('[data-testid="dispute-reopen-btn"]')
    expect(disputeBtn).toBeNull()
  })
})
