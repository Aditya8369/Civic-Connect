// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResolutionChatDrawer } from './ResolutionChatDrawer'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  return {
    sendResolutionMessage: vi.fn(async () => ({ id: 'new-msg-1' })),
    subscribeToResolutionChat: vi.fn(),
    markResolutionMessagesAsRead: vi.fn(),
  }
})

vi.mock('@/firebase/resolutionChat', () => ({
  sendResolutionMessage: mocks.sendResolutionMessage,
  subscribeToResolutionChat: mocks.subscribeToResolutionChat,
  markResolutionMessagesAsRead: mocks.markResolutionMessagesAsRead,
  QUICK_ACTION_PROMPTS: {
    officer: [
      { id: 'landmark_request', label: 'Request Landmark', text: 'Can you specify a nearby landmark?' },
      { id: 'worker_onsite', label: 'Worker On-site', text: 'A municipal worker is on-site.' },
    ],
    citizen: [
      { id: 'landmark_clarified', label: 'Landmark Provided', text: 'I provided the landmark.' },
    ],
  },
}))

vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('ResolutionChatDrawer', () => {
  let container
  let root
  let mockUnsub

  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    mockUnsub = vi.fn()
    mocks.subscribeToResolutionChat.mockImplementation((issueId, onMessages) => {
      onMessages([])
      return mockUnsub
    })

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
    vi.clearAllMocks()
  })

  const mockComplaint = {
    id: 'issue-100',
    complaintId: 'CMP-2026-100',
    title: 'Water Leak on Main St',
    department: 'Water',
    reportedBy: 'citizen-1',
  }

  const mockCitizen = {
    uid: 'citizen-1',
    displayName: 'Aarav Patel',
    role: 'citizen',
  }

  const mockOfficer = {
    uid: 'officer-1',
    displayName: 'Officer Verma',
    role: 'officer',
  }

  it('renders nothing when isOpen is false', () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={false}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })
    expect(container.querySelector('[data-testid="resolution-chat-drawer"]')).toBeNull()
  })

  it('renders drawer header, complaint ID, and encryption indicator when open', () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const drawer = container.querySelector('[data-testid="resolution-chat-drawer"]')
    expect(drawer).not.toBeNull()
    expect(drawer.textContent).toContain('Resolution Channel')
    expect(drawer.textContent).toContain('#CMP-2026-100')
    expect(drawer.textContent).toContain('Water Leak on Main St')
    expect(drawer.textContent).toContain('Encrypted | Contact details protected')
  })

  it('calls onClose when close button or backdrop is clicked', () => {
    const onClose = vi.fn()
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={onClose}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const closeBtn = container.querySelector('button[aria-label="Close resolution chat"]')
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = container.querySelector('[data-testid="chat-backdrop"]')
    act(() => {
      backdrop.click()
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('renders messages and marks unread messages as read', () => {
    mocks.subscribeToResolutionChat.mockImplementation((issueId, onMessages) => {
      onMessages([
        {
          id: 'm1',
          senderId: 'officer-1',
          senderName: 'Officer Verma',
          senderRole: 'officer',
          decryptedContent: 'Can you specify a nearby landmark?',
          quickActionType: 'landmark_request',
          readBy: ['officer-1'],
        },
        {
          id: 'm2',
          senderId: 'citizen-1',
          senderName: 'Aarav Patel',
          senderRole: 'citizen',
          decryptedContent: 'It is opposite the municipal water tank.',
          readBy: ['citizen-1'],
        },
      ])
      return mockUnsub
    })

    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const messages = container.querySelectorAll('[data-testid="chat-message-item"]')
    expect(messages.length).toBe(2)
    expect(container.textContent).toContain('Can you specify a nearby landmark?')
    expect(container.textContent).toContain('It is opposite the municipal water tank.')
    expect(container.querySelector('[data-testid="quick-action-badge"]')).not.toBeNull()

    // Verifies markResolutionMessagesAsRead called for m1
    expect(mocks.markResolutionMessagesAsRead).toHaveBeenCalledWith(
      'CMP-2026-100',
      ['m1'],
      'citizen-1'
    )
  })

  it('sends message when a quick action prompt is clicked', async () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockOfficer}
        />
      )
    })

    const landmarkPromptBtn = container.querySelector('[data-testid="quick-prompt-landmark_request"]')
    expect(landmarkPromptBtn).not.toBeNull()

    await act(async () => {
      landmarkPromptBtn.click()
    })

    expect(mocks.sendResolutionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'CMP-2026-100',
        senderId: 'officer-1',
        senderRole: 'officer',
        content: 'Can you specify a nearby landmark?',
        quickActionType: 'landmark_request',
      })
    )
  })

  it('sends custom message typed into the input', async () => {
    act(() => {
      root.render(
        <ResolutionChatDrawer
          isOpen={true}
          onClose={vi.fn()}
          complaint={mockComplaint}
          currentUser={mockCitizen}
        />
      )
    })

    const input = container.querySelector('[data-testid="chat-input"]')
    const sendBtn = container.querySelector('[data-testid="chat-send-btn"]')

    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set
      if (nativeSetter) {
        nativeSetter.call(input, 'We can see the maintenance crew arriving now.')
      } else {
        input.value = 'We can see the maintenance crew arriving now.'
      }
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      sendBtn.click()
    })

    expect(mocks.sendResolutionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: 'CMP-2026-100',
        senderId: 'citizen-1',
        senderRole: 'citizen',
        content: 'We can see the maintenance crew arriving now.',
      })
    )
  })
})
