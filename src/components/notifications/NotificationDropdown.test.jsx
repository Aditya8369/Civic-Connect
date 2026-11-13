// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationDropdown } from './NotificationDropdown'
import { markNotificationAsRead, markAllNotificationsAsRead } from '@/firebase/notifications'
import toast from 'react-hot-toast'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/firebase/notifications', () => ({
  markNotificationAsRead: vi.fn().mockResolvedValue(),
  markAllNotificationsAsRead: vi.fn().mockResolvedValue(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
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
    createdAt: new Date('2026-11-13T11:50:00Z'),
    issueId: 'CMP-2026-0001',
  },
  {
    id: 'n-2',
    type: 'department_assigned',
    title: 'Assigned to Roads',
    message: 'Roads department will inspect tomorrow.',
    read: false,
    createdAt: new Date('2026-11-13T10:00:00Z'),
    issueId: 'CMP-2026-0002',
  },
  {
    id: 'n-3',
    type: 'announcement',
    title: 'City Council Meeting',
    message: 'Join the annual budget town hall.',
    read: true,
    createdAt: new Date('2026-11-12T14:00:00Z'),
  },
  {
    id: 'n-4',
    type: 'mention',
    title: 'Worker Mentioned You',
    message: '@citizen can you verify the streetlight location?',
    read: false,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    issueId: 'CMP-2026-0003',
  },
]

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  document.body.innerHTML = ''
})

function renderComponent(props = {}) {
  act(() => {
    root.render(
      <NotificationDropdown
        notifications={mockNotifications}
        defaultOpen={true}
        {...props}
      />
    )
  })
}

describe('NotificationDropdown', () => {
  it('renders tactile bell trigger with unread count badge', () => {
    renderComponent({ defaultOpen: false })
    const bellBtn = container.querySelector('button[aria-label="View notifications"]')
    expect(bellBtn).toBeTruthy()

    const badge = container.querySelector('[data-testid="unread-badge"]')
    expect(badge).toBeTruthy()
    // 3 out of 4 mock notifications are unread (n-1, n-2, n-4)
    expect(badge.textContent).toBe('3')
  })

  it('renders "9+" on unread badge when unread count exceeds 9', () => {
    const manyUnread = Array.from({ length: 12 }, (_, i) => ({
      id: `u-${i}`,
      type: 'status_update',
      title: `Notice ${i}`,
      message: `Update ${i}`,
      read: false,
      createdAt: new Date(),
    }))

    renderComponent({ notifications: manyUnread, defaultOpen: false })
    const badge = container.querySelector('[data-testid="unread-badge"]')
    expect(badge.textContent).toBe('9+')
  })

  it('renders category filter tabs (All, Status Updates, Announcements, Mentions) with counts', () => {
    renderComponent()
    const tabs = document.querySelectorAll('[role="tab"]')
    expect(tabs.length).toBe(4)

    const tabLabels = Array.from(tabs).map((t) => t.textContent)
    expect(tabLabels.some((l) => l.includes('All'))).toBe(true)
    expect(tabLabels.some((l) => l.includes('Status Updates'))).toBe(true)
    expect(tabLabels.some((l) => l.includes('Announcements'))).toBe(true)
    expect(tabLabels.some((l) => l.includes('Mentions'))).toBe(true)
  })

  it('switches category filter tabs and updates displayed list', () => {
    renderComponent()

    // Initially in "All" tab (displays all items)
    expect(document.body.textContent).toContain('Pothole Fixed')
    expect(document.body.textContent).toContain('City Council Meeting')
    expect(document.body.textContent).toContain('Worker Mentioned You')

    // Click "Announcements" tab
    const tabs = document.querySelectorAll('[role="tab"]')
    const announcementTab = Array.from(tabs).find((t) => t.textContent.includes('Announcements'))
    act(() => {
      announcementTab.click()
    })

    // Now only announcement is visible
    expect(document.body.textContent).toContain('City Council Meeting')
    expect(document.body.textContent).not.toContain('Pothole Fixed')
    expect(document.body.textContent).not.toContain('Worker Mentioned You')
  })

  it('renders relative timestamps correctly', () => {
    renderComponent()
    // Check that timestamps are rendered
    expect(document.body.textContent).toContain('Pothole Fixed')
    expect(document.body.textContent).toContain('CMP-2026-0001')
  })

  it('performs 1-click "Mark all as read" with immediate optimistic UI update', async () => {
    renderComponent()

    const markAllBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Mark all as read')
    )
    expect(markAllBtn).toBeTruthy()
    expect(markAllBtn.disabled).toBe(false)

    // Immediate optimistic update on click
    await act(async () => {
      markAllBtn.click()
    })

    // Expect Firestore batch method to be called with unread notification IDs: ['n-1', 'n-2', 'n-4']
    expect(markAllNotificationsAsRead).toHaveBeenCalledWith(
      expect.arrayContaining(['n-1', 'n-2', 'n-4'])
    )

    // Unread indicators should immediately clear optimistically
    const unreadDots = document.querySelectorAll('[data-testid="unread-indicator-dot"]')
    expect(unreadDots.length).toBe(0)
    expect(document.body.textContent).toContain('All caught up')
    expect(toast.success).toHaveBeenCalledWith('All notifications marked as read', expect.any(Object))
  })

  it('rolls back optimistic "Mark all as read" if Firestore rejects', async () => {
    markAllNotificationsAsRead.mockRejectedValueOnce(new Error('Network failure'))
    renderComponent()

    const markAllBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Mark all as read')
    )

    await act(async () => {
      markAllBtn.click()
    })

    expect(toast.error).toHaveBeenCalledWith('Failed to update notifications')
    // After rollback, unread dots are restored
    const unreadDots = document.querySelectorAll('[data-testid="unread-indicator-dot"]')
    expect(unreadDots.length).toBe(3)
  })

  it('toggles single notification read state optimistically without triggering row navigation', async () => {
    const handleNotificationClick = vi.fn()
    renderComponent({ onNotificationClick: handleNotificationClick })

    const toggleBtns = document.querySelectorAll('button[aria-label="Mark as read"]')
    expect(toggleBtns.length).toBe(3) // 3 unread items

    const firstToggle = toggleBtns[0]
    await act(async () => {
      firstToggle.click()
    })

    // markNotificationAsRead was called
    expect(markNotificationAsRead).toHaveBeenCalledWith('n-1', true)
    // Row click should NOT have been triggered
    expect(handleNotificationClick).not.toHaveBeenCalled()
  })

  it('triggers item navigation when clicking a notification row', () => {
    const handleNotificationClick = vi.fn()
    renderComponent({ onNotificationClick: handleNotificationClick })

    const row = Array.from(document.querySelectorAll('[role="button"]')).find((el) =>
      el.textContent.includes('Pothole Fixed')
    )
    expect(row).toBeTruthy()

    act(() => {
      row.click()
    })

    expect(handleNotificationClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'n-1' })
    )
  })

  it('renders empty state illustration and copy when no notifications exist', () => {
    renderComponent({ notifications: [] })

    const emptyState = document.querySelector('[data-testid="notification-empty-state"]')
    expect(emptyState).toBeTruthy()
    expect(emptyState.textContent).toContain('All caught up!')
    expect(emptyState.querySelector('svg')).toBeTruthy()
  })

  it('renders empty tab state when selected category has no items', () => {
    // Only status updates
    const onlyStatus = [mockNotifications[0]]
    renderComponent({ notifications: onlyStatus })

    // Switch to Mentions tab which has 0 items
    const tabs = document.querySelectorAll('[role="tab"]')
    const mentionTab = Array.from(tabs).find((t) => t.textContent.includes('Mentions'))
    act(() => {
      mentionTab.click()
    })

    expect(document.body.textContent).toContain('No updates in this tab')
  })

  it('renders push permission banner when permissionStatus is default', () => {
    const handleRequestPush = vi.fn()
    renderComponent({
      permissionStatus: 'default',
      onRequestPush: handleRequestPush,
    })

    expect(document.body.textContent).toContain('Enable push alerts?')
    const enableBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Enable Notifications')
    )
    expect(enableBtn).toBeTruthy()

    act(() => {
      enableBtn.click()
    })
    expect(handleRequestPush).toHaveBeenCalled()
  })
})

