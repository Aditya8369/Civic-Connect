// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MyReportsPage } from './MyReportsPage'
import { NotificationCenter } from '@/components/NotificationCenter'
import CommunityFeed from '@/components/citizen/CommunityFeed'

const mockNavigate = vi.fn()
const authState = {
  user: { uid: 'citizen-1', role: 'citizen', name: 'Citizen Jane' },
  loading: false,
}

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/firebase/notifications', () => ({
  getPushPermissionStatus: () => 'granted',
  requestPushPermission: vi.fn(),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: { uid: 'citizen-1' } },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: () => ({
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(),
  }),
  getDocs: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
  limit: vi.fn(),
  runTransaction: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: () => 'server-time',
  onSnapshot: vi.fn((_q, ...args) => {
    const callback = typeof args[0] === 'function' ? args[0] : args[1]
    if (callback) {
      callback({ docs: [], metadata: { hasPendingWrites: false, fromCache: false } })
    }
    return vi.fn() // unsubscribe
  }),
}))

let container = null
let root = null

async function renderComponent(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(element)
  })
}

function cleanupComponent() {
  if (root) {
    act(() => {
      root.unmount()
    })
    root = null
  }
  if (container && container.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
}

describe('Empty States Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { uid: 'citizen-1', role: 'citizen', name: 'Citizen Jane' }
    authState.loading = false
  })

  afterEach(() => {
    cleanupComponent()
  })

  describe('My Reports Page', () => {
    it('renders empty state when citizen has no submitted reports', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, ...args) => {
        const cb = typeof args[0] === 'function' ? args[0] : args[1]
        // Immediate callback with empty docs
        cb({
          docs: [],
          metadata: { hasPendingWrites: false, fromCache: false },
        })
        return vi.fn()
      })

      await renderComponent(<MyReportsPage />)

      // Expected Issue #112 specs
      expect(container.textContent).toContain('No Reports Yet')
      expect(container.textContent).toContain(
        "You haven't submitted any civic reports yet. Help improve your community by reporting an issue."
      )

      // Action button
      const reportBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Report an Issue')
      )
      expect(reportBtn).toBeDefined()

      await act(async () => {
        reportBtn.click()
      })

      expect(mockNavigate).toHaveBeenCalledWith('/report')
    })

    it('renders populated complaints list when citizen has reports', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, ...args) => {
        const cb = typeof args[0] === 'function' ? args[0] : args[1]
        cb({
          docs: [
            {
              id: 'issue-101',
              data: () => ({
                title: 'Pothole on Main St',
                complaintId: 'CMP-2026-0101',
                category: 'Roads',
                status: 'Pending',
                address: '100 Main St',
                reportedBy: 'citizen-1',
                createdAt: { toDate: () => new Date('2026-11-01') },
              }),
            },
          ],
          metadata: { hasPendingWrites: false, fromCache: false },
        })
        return vi.fn()
      })

      await renderComponent(<MyReportsPage />)

      expect(container.textContent).toContain('Pothole on Main St')
      expect(container.textContent).toContain('CMP-2026-0101')
      expect(container.textContent).not.toContain('No Reports Yet')
    })

    it('renders filtered empty state with clear action when search yields no results', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, ...args) => {
        const cb = typeof args[0] === 'function' ? args[0] : args[1]
        cb({
          docs: [
            {
              id: 'issue-101',
              data: () => ({
                title: 'Pothole on Main St',
                complaintId: 'CMP-2026-0101',
                category: 'Roads',
                status: 'Pending',
                address: '100 Main St',
                reportedBy: 'citizen-1',
                createdAt: { toDate: () => new Date('2026-11-01') },
              }),
            },
          ],
          metadata: { hasPendingWrites: false, fromCache: false },
        })
        return vi.fn()
      })

      await renderComponent(<MyReportsPage />)

      // Enter search query that matches nothing
      const input = container.querySelector('input')
      await act(async () => {
        // native input change
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set
        nativeInputValueSetter.call(input, 'NonExistentTerm')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      })

      expect(container.textContent).toContain('No Complaints Found')
      expect(container.textContent).toContain('Try a different search term or clear your search query.')

      const clearBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Clear Search')
      )
      expect(clearBtn).toBeDefined()

      await act(async () => {
        clearBtn.click()
      })

      expect(container.textContent).toContain('Pothole on Main St')
    })

    it('renders error banner and not empty state on load failure', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, ...args) => {
        const errCb = typeof args[0] === 'function' ? args[1] : args[2]
        errCb?.(new Error('Firestore network error'))
        return vi.fn()
      })

      await renderComponent(<MyReportsPage />)

      expect(container.textContent).not.toContain('No Reports Yet')
      expect(container.textContent).toContain("Couldn't load reports")
    })
  })

  describe('Notifications Page & NotificationCenter', () => {
    it('renders empty state when citizen has no notifications', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, cb) => {
        cb({ docs: [] })
        return vi.fn()
      })

      await renderComponent(<NotificationCenter />)

      // Expected Issue #112 specs
      expect(container.textContent).toContain("You're All Caught Up!")
      expect(container.textContent).toContain(
        "You don't have any notifications right now. We'll let you know when there are updates."
      )
      expect(container.querySelector('svg')).not.toBeNull()
    })

    it('renders populated list when notifications exist', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, cb) => {
        cb({
          docs: [
            {
              id: 'notif-1',
              data: () => ({
                title: 'Complaint Resolved',
                message: 'Your report #CMP-2026-0101 has been marked resolved.',
                type: 'status_update',
                read: false,
                issueId: 'CMP-2026-0101',
                createdAt: { toDate: () => new Date() },
              }),
            },
          ],
        })
        return vi.fn()
      })

      await renderComponent(<NotificationCenter />)

      expect(container.textContent).toContain('Complaint Resolved')
      expect(container.textContent).toContain('Your report #CMP-2026-0101 has been marked resolved.')
      expect(container.textContent).not.toContain("You're All Caught Up!")
    })
  })

  describe('Community Feed', () => {
    it('renders empty state when there are no community posts', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, cb) => {
        cb({ docs: [] })
        return vi.fn()
      })

      await renderComponent(<CommunityFeed />)

      // Expected Issue #112 specs
      expect(container.textContent).toContain('No Community Posts Yet')
      expect(container.textContent).toContain(
        'There are no posts to display right now. Be part of your community by sharing an update.'
      )

      const postBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Create a Post')
      )
      expect(postBtn).toBeDefined()

      await act(async () => {
        postBtn.click()
      })

      expect(mockNavigate).toHaveBeenCalledWith('/report')
    })

    it('renders community posts when complaints exist', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, cb) => {
        cb({
          docs: [
            {
              id: 'issue-201',
              data: () => ({
                title: 'Broken Streetlight on Elm St',
                category: 'Electricity',
                upvotesCount: 5,
                upvotedBy: ['user-a'],
                createdAt: { seconds: 1700000000 },
              }),
            },
          ],
        })
        return vi.fn()
      })

      await renderComponent(<CommunityFeed />)

      expect(container.textContent).toContain('Broken Streetlight on Elm St')
      expect(container.textContent).not.toContain('No Community Posts Yet')
    })

    it('renders filtered empty state when selected category has no posts', async () => {
      const { onSnapshot } = await import('firebase/firestore')
      onSnapshot.mockImplementation((_query, cb) => {
        cb({
          docs: [
            {
              id: 'issue-201',
              data: () => ({
                title: 'Broken Streetlight on Elm St',
                category: 'Electricity',
                upvotesCount: 5,
                upvotedBy: ['user-a'],
                createdAt: { seconds: 1700000000 },
              }),
            },
          ],
        })
        return vi.fn()
      })

      await renderComponent(<CommunityFeed />)

      // Change category filter
      const select = container.querySelector('select')
      await act(async () => {
        select.value = 'NonExistent'
        select.dispatchEvent(new Event('change', { bubbles: true }))
      })

      expect(container.textContent).toContain('No Community Posts Found')
      expect(container.textContent).toContain('There are no community posts in this category.')

      const showAllBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent.includes('Show All Categories')
      )
      expect(showAllBtn).toBeDefined()

      await act(async () => {
        showAllBtn.click()
      })

      expect(container.textContent).toContain('Broken Streetlight on Elm St')
    })
  })
})
