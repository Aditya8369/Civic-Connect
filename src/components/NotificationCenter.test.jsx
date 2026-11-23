// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationCenter } from './NotificationCenter'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { resolveCitizenComplaintDocumentId } from '@/firebase/complaintReferences'
import toast from 'react-hot-toast'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockNavigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

let mockUser = { uid: 'user-123' }
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}))

vi.mock('@/firebase/complaintReferences', () => ({
  resolveCitizenComplaintDocumentId: vi.fn(),
}))

vi.mock('@/firebase/notifications', () => ({
  getPushPermissionStatus: vi.fn(() => 'granted'),
  requestPushPermission: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

let mockSnapshotCallback = null
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(() => ({
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(),
  })),
  onSnapshot: vi.fn((_q, cb) => {
    mockSnapshotCallback = cb
    return vi.fn() // unsubscribe
  }),
}))

let container
let root

const mockNotifications = [
  {
    id: 'n-1',
    type: 'status_update',
    title: 'Pothole Fixed',
    message: 'Your report on Main Street was resolved.',
    read: false,
    createdAt: { toDate: () => new Date('2026-11-13T11:50:00Z') },
    issueId: 'CMP-2026-0001',
  },
  {
    id: 'n-2',
    type: 'announcement',
    title: 'City Council Meeting',
    message: 'Join the annual budget town hall.',
    read: true,
    createdAt: { toDate: () => new Date('2026-11-12T14:00:00Z') },
    // No issueId: informational notification
  },
]

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  mockSnapshotCallback = null
  mockUser = { uid: 'user-123' }
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ''
})

function renderComponent() {
  act(() => {
    root.render(
      <LanguageProvider>
        <NotificationCenter />
      </LanguageProvider>
    )
  })

  // Trigger onSnapshot with mock notifications
  if (mockSnapshotCallback) {
    act(() => {
      mockSnapshotCallback({
        docs: mockNotifications.map((n) => ({
          id: n.id,
          data: () => n,
        })),
      })
    })
  }
}

describe('NotificationCenter Keyboard Accessibility (Issue #284)', () => {
  it('renders interactive notification with complaint ID as a native button with accessible name', () => {
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()
    expect(complaintButton.tagName.toLowerCase()).toBe('button')
    expect(complaintButton.getAttribute('type')).toBe('button')
    expect(complaintButton.textContent).toContain('Pothole Fixed')
    expect(complaintButton.textContent).toContain('CMP-2026-0001')
  })

  it('renders notification without complaint ID as non-interactive informational card', () => {
    renderComponent()

    const announcementCard = container.querySelector('button[aria-label="City Council Meeting: Join the annual budget town hall."]')
    expect(announcementCard).toBeNull()

    // It should be a div instead
    const cards = container.querySelectorAll('.space-y-3 > *')
    expect(cards.length).toBe(2)
    expect(cards[1].tagName.toLowerCase()).toBe('div')
    expect(cards[1].textContent).toContain('City Council Meeting')
    expect(cards[1].textContent).toContain('Join the annual budget town hall.')
    expect(cards[1].getAttribute('tabindex')).toBeNull()
  })

  it('allows keyboard navigation via Tab key and displays visible focus ring', () => {
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()

    // Has appropriate focus-visible classes
    expect(complaintButton.className).toContain('focus-visible:ring-2')
    expect(complaintButton.className).toContain('focus-visible:ring-primary-500')

    // Can receive focus
    complaintButton.focus()
    expect(document.activeElement).toBe(complaintButton)
  })

  it('activates navigation on Enter key press via native button semantics', async () => {
    resolveCitizenComplaintDocumentId.mockResolvedValue('doc-123')
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()

    complaintButton.focus()
    // Native button dispatch click upon Enter/Space
    act(() => {
      complaintButton.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })
      )
      // Browsers trigger a click event on buttons for Enter keydown
      complaintButton.click()
    })

    expect(resolveCitizenComplaintDocumentId).toHaveBeenCalledWith('CMP-2026-0001', 'user-123')
    // Wait microtasks
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/complaints/doc-123')
  })

  it('activates navigation on Space key press via native button semantics', async () => {
    resolveCitizenComplaintDocumentId.mockResolvedValue('doc-123')
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()

    complaintButton.focus()
    act(() => {
      complaintButton.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })
      )
      // Browsers trigger a click event on buttons for Space keyup
      complaintButton.click()
    })

    expect(resolveCitizenComplaintDocumentId).toHaveBeenCalledWith('CMP-2026-0001', 'user-123')
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockNavigate).toHaveBeenCalledWith('/complaints/doc-123')
  })

  it('handles complaint lookup error gracefully and shows error toast', async () => {
    resolveCitizenComplaintDocumentId.mockRejectedValue(new Error('Network error'))
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()

    act(() => {
      complaintButton.click()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('handles complaint not found error when documentId is null', async () => {
    resolveCitizenComplaintDocumentId.mockResolvedValue(null)
    renderComponent()

    const complaintButton = container.querySelector('button[aria-label="Pothole Fixed: Your report on Main Street was resolved."]')
    expect(complaintButton).toBeTruthy()

    act(() => {
      complaintButton.click()
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
})
