// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComplaintAuditTimeline } from './ComplaintAuditTimeline'
import * as firestore from 'firebase/firestore'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/firebase/services', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => `${coll}/${id}`),
  getDoc: vi.fn(),
}))

let container = null
let root = null

function renderComponent(ui) {
  act(() => {
    root.render(ui)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  vi.clearAllMocks()
  firestore.getDoc.mockResolvedValue({
    exists: () => false,
    data: () => null,
  })
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

describe('ComplaintAuditTimeline', () => {
  it('renders Activity & Audit History heading', () => {
    renderComponent(<ComplaintAuditTimeline complaint={{}} events={[]} />)
    expect(container.textContent).toContain('Activity & Audit History')
  })

  it('renders loading state when loading is true', () => {
    renderComponent(<ComplaintAuditTimeline loading={true} />)
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })

  it('renders error state when error is provided', () => {
    renderComponent(<ComplaintAuditTimeline error={new Error('Firestore error')} />)
    expect(container.textContent).toContain('Failed to load audit history.')
  })

  it('renders empty state when no events and no valid createdAt on complaint', () => {
    renderComponent(<ComplaintAuditTimeline complaint={{}} events={[]} />)
    expect(container.textContent).toContain('No audit activity recorded for this complaint.')
  })

  it('renders legacy initial entry when events array is empty but complaint has createdAt', () => {
    const complaint = {
      createdAt: '2026-03-01T10:00:00Z',
      reportedBy: 'user-reporter',
      status: 'Pending',
      description: 'Pothole on Main St',
    }
    renderComponent(<ComplaintAuditTimeline complaint={complaint} events={[]} />)
    expect(container.textContent).toContain('Initial submission (legacy record)')
    expect(container.textContent).toContain('Legacy')
    expect(container.textContent).toContain('Citizen (Reporter)')
    expect(container.textContent).toContain('Pothole on Main St')
  })

  it('renders all supported event action types correctly', async () => {
    const supportedActions = [
      'Complaint submitted',
      'Status changed',
      'Department assigned',
      'Resolution notes updated',
      'Field worker designated',
      'Complaint merged',
      'Duplicate complaint consolidated',
    ]

    const events = supportedActions.map((action, i) => ({
      id: `evt-${i}`,
      action,
      timestamp: 1772366400000 + i * 1000,
      actorUid: 'admin-1',
      remarks: `Remarks for ${action}`,
    }))

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{ reportedBy: 'user-cit' }} events={events} />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    supportedActions.forEach((action) => {
      expect(container.textContent).toContain(action)
      expect(container.textContent).toContain(`Remarks for ${action}`)
    })
  })

  it('displays events in chronological order', () => {
    const events = [
      { id: '1', action: 'Action First', timestamp: 1000 },
      { id: '2', action: 'Action Second', timestamp: 2000 },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    const firstIndex = container.textContent.indexOf('Action First')
    const secondIndex = container.textContent.indexOf('Action Second')
    expect(firstIndex).toBeGreaterThan(-1)
    expect(secondIndex).toBeGreaterThan(firstIndex)
  })

  it('displays status transition when previousStatus and newStatus are valid and different', () => {
    const events = [
      {
        id: '1',
        action: 'Status changed',
        timestamp: 1000,
        previousStatus: 'Pending',
        newStatus: 'In Progress',
      },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    expect(container.textContent).toContain('Pending')
    expect(container.textContent).toContain('In Progress')
  })

  it('does not display transition when previousStatus equals newStatus or either is missing', () => {
    const events = [
      {
        id: '1',
        action: 'Department assigned',
        timestamp: 1000,
        previousStatus: 'Pending',
        newStatus: 'Pending',
      },
      {
        id: '2',
        action: 'Resolution notes updated',
        timestamp: 2000,
        previousStatus: null,
        newStatus: 'Pending',
      },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    expect(container.querySelectorAll('.lucide-arrow-right')).toHaveLength(0)
  })

  it('renders remarks correctly and handles empty or missing remarks safely', () => {
    const events = [
      { id: '1', action: 'Event with remarks', timestamp: 1000, remarks: 'Fixed leak & cleaned up' },
      { id: '2', action: 'Event without remarks', timestamp: 2000, remarks: '' },
      { id: '3', action: 'Event null remarks', timestamp: 3000, remarks: null },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    expect(container.textContent).toContain('Fixed leak & cleaned up')
  })

  it('identifies reporter as Citizen (Reporter) when actorUid === complaint.reportedBy', () => {
    const complaint = { reportedBy: 'reporter-123' }
    const events = [
      {
        id: '1',
        action: 'Complaint submitted',
        timestamp: 1000,
        actorUid: 'reporter-123',
      },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={complaint} events={events} />)
    expect(container.textContent).toContain('Citizen (Reporter)')
    expect(firestore.getDoc).not.toHaveBeenCalled()
  })

  it('retrieves user profile and displays verified name and role badge', async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ name: 'Officer Rajesh', role: 'admin' }),
    })

    const events = [
      {
        id: '1',
        action: 'Department assigned',
        timestamp: 1000,
        actorUid: 'admin-uid-1',
      },
    ]

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{ reportedBy: 'other-user' }} events={events} />)
    })

    // Allow promise resolution
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Officer Rajesh')
    expect(container.textContent).toContain('admin')
  })

  it('displays System / Unspecified Actor when actorUid is missing or profile not found', async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => null,
    })

    const events = [
      {
        id: '1',
        action: 'Status changed',
        timestamp: 1000,
        actorUid: null,
      },
      {
        id: '2',
        action: 'Department assigned',
        timestamp: 2000,
        actorUid: 'non-existent-user',
      },
    ]

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{ reportedBy: 'user-x' }} events={events} />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('System / Unspecified Actor')
  })

  it('uses profile cache to prevent repeated Firestore reads for the same actorUid', async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ name: 'Engineer Sunita', role: 'officer' }),
    })

    const events = [
      { id: '1', action: 'Event 1', timestamp: 1000, actorUid: 'sunita-1' },
      { id: '2', action: 'Event 2', timestamp: 2000, actorUid: 'sunita-1' },
    ]

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{ reportedBy: 'other' }} events={events} />)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Engineer Sunita')
    expect(firestore.getDoc).toHaveBeenCalledTimes(1)

    // Rerender with a third event with the same UID
    const moreEvents = [
      ...events,
      { id: '3', action: 'Event 3', timestamp: 3000, actorUid: 'sunita-1' },
    ]

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{ reportedBy: 'other' }} events={moreEvents} />)
    })

    expect(firestore.getDoc).toHaveBeenCalledTimes(1)
  })

  it('safely handles Firestore Timestamp objects, ISO strings, numeric timestamps, and invalid timestamps', () => {
    const events = [
      { id: '1', action: 'TS 1', timestamp: { toDate: () => new Date('2026-04-10T11:00:00Z') } },
      { id: '2', action: 'TS 2', timestamp: '2026-04-10T12:00:00Z' },
      { id: '3', action: 'TS 3', timestamp: 1772366400000 },
      { id: '4', action: 'TS 4', timestamp: 'invalid-string' },
    ]

    renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    expect(container.textContent).toContain('TS 1')
    expect(container.textContent).toContain('TS 2')
    expect(container.textContent).toContain('TS 3')
    expect(container.textContent).toContain('TS 4')
  })

  it('legacy fallback does not create or write any Firestore documents', () => {
    const complaint = {
      createdAt: '2026-03-01T10:00:00Z',
      reportedBy: 'user-reporter',
      status: 'Pending',
      description: 'Pothole on Main St',
    }
    renderComponent(<ComplaintAuditTimeline complaint={complaint} events={[]} />)
    expect(firestore.doc).not.toHaveBeenCalled()
    expect(firestore.getDoc).not.toHaveBeenCalled()
  })

  it('does not display a role badge for an unresolved actor', async () => {
    firestore.getDoc.mockResolvedValueOnce({
      exists: () => false,
      data: () => null,
    })

    const events = [
      {
        id: '1',
        action: 'Status changed',
        timestamp: 1000,
        actorUid: 'unresolved-user',
      },
    ]

    await act(async () => {
      renderComponent(<ComplaintAuditTimeline complaint={{}} events={events} />)
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('System / Unspecified Actor')
    // No role badges rendered
    expect(container.querySelectorAll('.badge-secondary')).toHaveLength(0)
  })
})
