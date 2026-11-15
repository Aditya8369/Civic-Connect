// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComplaintDetailsPage } from './ComplaintDetailsPage'

const runtime = vi.hoisted(() => ({
  complaint: null,
  navigate: vi.fn(),
  user: {
    uid: 'citizen-owner-1',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    role: 'citizen',
  },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'complaint-101' }),
  useNavigate: () => runtime.navigate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.user }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: runtime.user },
}))

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: async (issueId) => issueId,
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  getDoc: vi.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({
        name: 'Priya Sharma',
        email: 'priya@example.com',
        phone: '+91 91234 56789',
      }),
    })
  ),
  onSnapshot: vi.fn((ref, callback) => {
    if (typeof ref === 'string' && ref.includes('events')) {
      callback({ docs: [] })
    } else {
      callback({
        id: 'complaint-101',
        exists: () => true,
        data: () => runtime.complaint,
      })
    }
    return vi.fn()
  }),
  updateDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => 'SERVER_TIME',
}))

vi.mock('@/components/common/SlaBadge', () => ({
  SlaBadge: () => <span data-testid="sla-badge">SLA</span>,
  SlaCountdown: () => <span data-testid="sla-countdown">Countdown</span>,
}))

vi.mock('@/components/citizen/ComplaintAudioPlayer', () => ({
  default: () => <div data-testid="audio-player" />,
}))

vi.mock('@/components/citizen/MilestoneCelebrationBanner', () => ({
  MilestoneCelebrationBanner: () => null,
}))

describe('ComplaintDetailsPage resolution feedback integration', () => {
  let container
  let root

  beforeEach(() => {
    runtime.complaint = {
      complaintId: 'CMP-2026-0001',
      title: 'Broken streetlight on 5th Ave',
      description: 'Streetlight is flickering and dark at night',
      category: 'Streetlights',
      address: '5th Ave & 12th St',
      status: 'Resolved',
      department: 'Electrical',
      reportedBy: 'citizen-owner-1',
      createdAt: { toDate: () => new Date('2026-11-01') },
      updatedAt: { toDate: () => new Date('2026-11-05') },
      resolvedAt: { toDate: () => new Date('2026-11-05') },
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
    vi.clearAllMocks()
  })

  async function renderPage() {
    await act(async () => {
      root.render(<ComplaintDetailsPage />)
    })
  }

  it('invites the owner to leave feedback once the complaint is resolved', async () => {
    await renderPage()

    expect(container.textContent).toContain('Resolution feedback')
    expect(container.textContent).toContain('Tell us how the work went.')
    expect(container.textContent).toContain('Leave feedback')
  })

  it('shows the submitted feedback instead of the form', async () => {
    runtime.complaint = {
      ...runtime.complaint,
      feedback: {
        rating: 5,
        tags: ['Quick response'],
        comment: 'Streetlight repaired within 24 hours.',
        submittedAt: { toDate: () => new Date('2026-11-06') },
      },
    }

    await renderPage()

    expect(container.textContent).toContain(
      'Thank you! Your feedback was submitted.'
    )
    expect(container.textContent).toContain('Very satisfied')
    expect(container.textContent).toContain('Quick response')
    expect(container.textContent).toContain(
      'Streetlight repaired within 24 hours.'
    )
    expect(container.textContent).not.toContain('Leave feedback')
  })

  it.each(['Pending', 'In Progress', 'Rejected', 'Reopened'])(
    'does not render feedback controls while the complaint is %s',
    async (status) => {
      runtime.complaint = {
        ...runtime.complaint,
        status,
        resolvedAt: null,
      }

      await renderPage()

      expect(container.textContent).not.toContain('Resolution feedback')
      expect(container.textContent).not.toContain('Leave feedback')
    }
  )

  it('does not render feedback controls for a non-owner viewer', async () => {
    runtime.complaint = {
      ...runtime.complaint,
      reportedBy: 'another-citizen',
      feedback: undefined,
    }

    await renderPage()

    expect(container.textContent).not.toContain('Resolution feedback')
  })
})
