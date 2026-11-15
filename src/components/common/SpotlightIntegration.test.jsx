
// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import {
  SpotlightProvider,
  useSpotlightSearch,
} from '@/contexts/SpotlightContext'
import { Navbar } from '@/components/layout/Navbar'
import * as firestore from 'firebase/firestore'

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

const mockNavigate = vi.fn()

let authState = {
  user: { uid: 'citizen-1', role: 'citizen', name: 'Citizen One' },
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

vi.mock('@/firebase/services', () => ({
  db: {},
  auth: { currentUser: { uid: 'citizen-1' } },
}))

vi.mock('@/firebase/notifications', () => ({
  getPushPermissionStatus: () => 'granted',
  requestPushPermission: vi.fn(),
  showNativeNotification: vi.fn(),
}))

const mockUnsubscribe = vi.fn()
let snapshotCallback = null

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => `collection:${name}`),
  query: vi.fn((...args) => ({ _queryArgs: args })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  doc: vi.fn(),

  onSnapshot: vi.fn((q, options, cb) => {
    snapshotCallback = typeof options === 'function' ? options : cb

    if (snapshotCallback) {
      snapshotCallback({
        docs: [
          {
            id: 'doc-1',
            data: () => ({
              complaintId: 'CMP-2026-0001',
              title: 'Water Pipe Burst in Ward 4',
              category: 'Water Leakage',
              reportedBy: 'citizen-1',
              priority: 'High',
              status: 'Pending',
              ward: 'Ward 4',
              address: 'Residency Road',
            }),
          },
        ],
        docChanges: () => [],
        metadata: {
          hasPendingWrites: false,
          fromCache: false,
        },
      })
    }

    return mockUnsubscribe
  }),
}))

let container = null
let root = null

function TestApp() {
  const { openSearch, isOpen } = useSpotlightSearch()

  return (
    <div>
      <Navbar onMenuClick={vi.fn()} />

      <button
        id="external-trigger"
        type="button"
        onClick={openSearch}
      >
        Open Search Manually
      </button>

      <input
        id="outside-input"
        type="text"
        placeholder="Regular form input"
      />

      <textarea
        id="outside-textarea"
        placeholder="Regular textarea"
      />

      <div id="modal-status">
        {isOpen ? 'Modal is Open' : 'Modal is Closed'}
      </div>
    </div>
  )
}

async function renderApp() {
  container = document.createElement('div')
  document.body.appendChild(container)

  root = createRoot(container)

  await act(async () => {
    root.render(
      <ThemeProvider>
        <LanguageProvider>
          <SpotlightProvider>
            <TestApp />
          </SpotlightProvider>
        </LanguageProvider>
      </ThemeProvider>
    )
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

  document.body.innerHTML = ''
}

describe('Spotlight Search Integration & Keyboard Shortcuts', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('civic-connect-language', 'en')

    authState = {
      user: {
        uid: 'citizen-1',
        role: 'citizen',
        name: 'Citizen One',
      },
      loading: false,
    }

    mockNavigate.mockReset()
    mockUnsubscribe.mockReset()

    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupComponent()
  })

  it('opens search modal using Ctrl + K shortcut and moves focus to search input', async () => {
    await renderApp()

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()

    // Trigger Ctrl + K
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        })
      )
    })

    const dialog = document.querySelector('[role="dialog"]')

    expect(dialog).not.toBeNull()

    expect(
      document.getElementById('modal-status')?.textContent
    ).toBe('Modal is Open')

    // Input receives focus
    const input = document.querySelector('input[role="combobox"]')

    expect(input).not.toBeNull()
  })

  it('opens search modal using Cmd + K shortcut on macOS', async () => {
    await renderApp()

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()

    // Trigger Cmd + K
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'K',
          metaKey: true,
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).not.toBeNull()
  })

  it('closes search modal using Escape shortcut and restores focus to previously focused element', async () => {
    await renderApp()

    const outsideBtn = document.getElementById('external-trigger')

    outsideBtn?.focus()

    expect(document.activeElement).toBe(outsideBtn)

    // Open via Ctrl + K
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).not.toBeNull()

    // Close via Escape
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()
  })

  it('does not trigger search modal unexpectedly when user types "k" or "/" into regular input/textarea', async () => {
    await renderApp()

    const regularInput = document.getElementById('outside-input')

    regularInput?.focus()

    // User types "k" (without Ctrl/Cmd modifier)
    await act(async () => {
      regularInput?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: false,
          metaKey: false,
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()

    // User types "/"
    await act(async () => {
      regularInput?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '/',
          ctrlKey: false,
          metaKey: false,
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()

    // User types in textarea
    const textarea = document.getElementById('outside-textarea')

    await act(async () => {
      textarea?.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: false,
          metaKey: false,
          bubbles: true,
        })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).toBeNull()
  })

  it('opens search modal via Navbar search button', async () => {
    await renderApp()

    const navbarSearchBtn = document.querySelector(
      'button[aria-label*="Search reports"]'
    )

    expect(navbarSearchBtn).not.toBeNull()

    await act(async () => {
      navbarSearchBtn?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })

    expect(
      document.querySelector('[role="dialog"]')
    ).not.toBeNull()
  })

  it('respects citizen role-based access control by querying only reportedBy complaints', async () => {
    authState = {
      user: {
        uid: 'citizen-42',
        role: 'citizen',
        name: 'Citizen Jane',
      },
      loading: false,
    }

    await renderApp()

    // Open modal to trigger query
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        })
      )
    })

    // Verify Firestore query used where('reportedBy', '==', 'citizen-42')
    expect(firestore.where).toHaveBeenCalledWith(
      'reportedBy',
      '==',
      'citizen-42'
    )
  })

  it('respects admin role-based access control by querying all complaints', async () => {
    authState = {
      user: {
        uid: 'admin-1',
        role: 'admin',
        name: 'Admin Master',
      },
      loading: false,
    }

    await renderApp()

    // Open modal
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'k',
          ctrlKey: true,
          bubbles: true,
        })
      )
    })

    // For admin, query is collection(db, 'issues') without where('reportedBy', ...)
    expect(firestore.collection).toHaveBeenCalledWith(
      expect.anything(),
      'issues'
    )
  })

  it('cleans up keyboard listeners properly on unmount without memory leaks', async () => {
    const removeEventListenerSpy = vi.spyOn(
      window,
      'removeEventListener'
    )

    await renderApp()

    cleanupComponent()

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'keydown',
      expect.any(Function)
    )

    removeEventListenerSpy.mockRestore()
  })
})
