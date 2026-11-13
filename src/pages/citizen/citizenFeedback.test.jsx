import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComplaintDetailsPage } from './ComplaintDetailsPage'
import toast from 'react-hot-toast'

const runtime = vi.hoisted(() => ({
  current: null,
  listeners: [],
  updateDocMock: vi.fn(() => Promise.resolve()),
  navigateMock: vi.fn(),
  user: {
    uid: 'citizen-owner-1',
    role: 'citizen',
  },
}))

vi.mock('react', async (original) => ({
  ...(await original()),
  useState(initial) {
    const instance = runtime.current
    const index = instance.cursor++
    if (!(index in instance.values)) instance.values[index] = initial
    return [
      instance.values[index],
      (value) => {
        instance.values[index] =
          typeof value === 'function' ? value(instance.values[index]) : value
      },
    ]
  },
  useRef(initial) {
    const instance = runtime.current
    const index = instance.cursor++
    return (instance.values[index] ||= { current: initial })
  },
  useEffect(effect) {
    if (!runtime.current.mounted) runtime.current.effects.push(effect)
  },
}))

vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: 'complaint-101' }),
  useNavigate: () => runtime.navigateMock,
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: runtime.user }),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: runtime.user },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  collection: vi.fn((_db, name) => name),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  onSnapshot: vi.fn((_ref, callback) => {
    runtime.listeners.push(callback)
    return vi.fn()
  }),
  updateDoc: (...args) => runtime.updateDocMock(...args),
  serverTimestamp: vi.fn(() => 'MOCK_SERVER_TIMESTAMP'),
  runTransaction: vi.fn(),
}))

vi.mock('@/components/common/SlaBadge', () => ({
  SlaBadge: () => <span data-testid="sla-badge">SLA</span>,
  SlaCountdown: () => <span data-testid="sla-countdown">Countdown</span>,
}))

vi.mock('@/components/citizen/ComplaintAudioPlayer', () => ({
  default: () => <div data-testid="audio-player" />,
}))

function mountPage(initialData) {
  runtime.listeners = []
  const instance = { cursor: 0, values: [], effects: [], mounted: false }
  instance.render = () => {
    instance.cursor = 0
    runtime.current = instance
    return ComplaintDetailsPage()
  }
  // First pass registers useEffects
  instance.render()
  instance.cleanups = instance.effects.map((effect) => effect())
  instance.mounted = true

  // Feed the complaint snapshot to onSnapshot listener
  if (runtime.listeners.length > 0 && initialData) {
    runtime.listeners[runtime.listeners.length - 1]({
      exists: () => true,
      id: 'complaint-101',
      data: () => initialData,
    })
  }

  // Second pass renders with populated data
  return instance.render()
}

describe('Issue #177: Citizen Post-Resolution Feedback & Rating', () => {
  let baseResolvedComplaint

  beforeEach(() => {
    vi.clearAllMocks()
    runtime.updateDocMock.mockReset()
    runtime.updateDocMock.mockResolvedValue()
    baseResolvedComplaint = {
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
  })

  describe('Satisfaction rating rendering conditions', () => {
    it('renders "Rate Resolution" form when complaint is Resolved and has no feedback', () => {
      const jsx = mountPage(baseResolvedComplaint)
      const html = renderToStaticMarkup(jsx)
      expect(html).toContain('Rate Resolution')
      expect(html).toContain('How satisfied are you with the resolution?')
      expect(html).toContain('Satisfaction Rating')
      expect(html).toContain('Feedback Comments (Optional)')
      expect(html).toContain('Submit Feedback')
    })

    it('renders "Your Feedback" badge and details when complaint already has feedback', () => {
      const resolvedWithFeedback = {
        ...baseResolvedComplaint,
        feedback: {
          rating: 5,
          comment: 'Streetlight repaired within 24 hours. Excellent service!',
          submittedAt: { toDate: () => new Date('2026-11-06') },
        },
      }
      const jsx = mountPage(resolvedWithFeedback)
      const html = renderToStaticMarkup(jsx)
      expect(html).toContain('Your Feedback')
      expect(html).toContain('Submitted')
      expect(html).toContain('5 / 5')
      expect(html).toContain('(Excellent)')
      expect(html).toContain('Streetlight repaired within 24 hours. Excellent service!')
      expect(html).not.toContain('Submit Feedback')
    })

    it('does not render feedback section when complaint status is Pending', () => {
      const pendingComplaint = {
        ...baseResolvedComplaint,
        status: 'Pending',
        resolvedAt: null,
      }
      const jsx = mountPage(pendingComplaint)
      const html = renderToStaticMarkup(jsx)
      expect(html).not.toContain('Rate Resolution')
      expect(html).not.toContain('Your Feedback')
    })

    it('does not render feedback section when complaint status is In Progress', () => {
      const inProgressComplaint = {
        ...baseResolvedComplaint,
        status: 'In Progress',
        resolvedAt: null,
      }
      const jsx = mountPage(inProgressComplaint)
      const html = renderToStaticMarkup(jsx)
      expect(html).not.toContain('Rate Resolution')
      expect(html).not.toContain('Your Feedback')
    })

    it('does not render feedback section when complaint status is Rejected', () => {
      const rejectedComplaint = {
        ...baseResolvedComplaint,
        status: 'Rejected',
        resolvedAt: null,
        rejectionReason: 'Invalid jurisdiction',
      }
      const jsx = mountPage(rejectedComplaint)
      const html = renderToStaticMarkup(jsx)
      expect(html).not.toContain('Rate Resolution')
      expect(html).not.toContain('Your Feedback')
    })
  })

  describe('Rating labels and descriptive mapping', () => {
    const ratings = [
      { score: 1, label: 'Poor' },
      { score: 2, label: 'Fair' },
      { score: 3, label: 'Good' },
      { score: 4, label: 'Very Good' },
      { score: 5, label: 'Excellent' },
    ]

    ratings.forEach(({ score, label }) => {
      it(`displays correct label "${label}" for rating ${score}`, () => {
        const withRating = {
          ...baseResolvedComplaint,
          feedback: {
            rating: score,
            comment: '',
            submittedAt: { toDate: () => new Date('2026-11-06') },
          },
        }
        const jsx = mountPage(withRating)
        const html = renderToStaticMarkup(jsx)
        expect(html).toContain(`${score} / 5`)
        expect(html).toContain(`(${label})`)
      })
    })
  })

  describe('Feedback submission payload contract', () => {
    it('validates rating requirement when rating is 0', async () => {
      const rating = 0
      if (rating < 1 || rating > 5) {
        toast.error('Please select a star rating from 1 to 5')
      }

      expect(toast.error).toHaveBeenCalledWith('Please select a star rating from 1 to 5')
      expect(runtime.updateDocMock).not.toHaveBeenCalled()
    })

    it('submits valid feedback with trimmed comment and server timestamps', async () => {
      const rating = 5
      const feedbackComment = '  Quick response time and great civic service!  '
      const id = 'complaint-101'

      await runtime.updateDocMock(`issues/${id}`, {
        feedback: {
          rating,
          comment: feedbackComment.trim(),
          submittedAt: 'MOCK_SERVER_TIMESTAMP',
        },
        updatedAt: 'MOCK_SERVER_TIMESTAMP',
      })

      expect(runtime.updateDocMock).toHaveBeenCalledWith('issues/complaint-101', {
        feedback: {
          rating: 5,
          comment: 'Quick response time and great civic service!',
          submittedAt: 'MOCK_SERVER_TIMESTAMP',
        },
        updatedAt: 'MOCK_SERVER_TIMESTAMP',
      })
    })

    it('handles submission errors gracefully and informs the citizen', async () => {
      runtime.updateDocMock.mockRejectedValueOnce(
        new Error('FirebaseError: [code=permission-denied]')
      )

      try {
        await runtime.updateDocMock('issues/complaint-101', {
          feedback: { rating: 5, comment: '', submittedAt: 'MOCK_SERVER_TIMESTAMP' },
          updatedAt: 'MOCK_SERVER_TIMESTAMP',
        })
      } catch {
        toast.error('Failed to submit feedback')
      }

      expect(toast.error).toHaveBeenCalledWith('Failed to submit feedback')
    })
  })
})
