// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

vi.mock('@/firebase/complaintId', () => ({
  getDisplayId: (complaint) => complaint.id,
}))

import {
  SlaEscalationBanner,
  getUrgentComplaints,
  URGENT_THRESHOLD_MS,
} from './SlaEscalationBanner'
import { getSlaTargetDate } from '@/utils/sla'

function nodes(element) {
  if (!element) return []
  if (Array.isArray(element)) return element.flatMap(nodes)
  return element?.props ? [element, ...nodes(element.props.children)] : []
}

function text(element) {
  if (element == null) return ''
  if (Array.isArray(element)) return element.map(text).join('')
  if (typeof element === 'string' || typeof element === 'number') {
    return String(element)
  }
  return element?.props ? text(element.props.children) : ''
}

function complaintFromRemainingTime({
  id,
  now,
  remainingMs,
  status = 'Pending',
}) {
  const baseCreatedAt = new Date(now)

  const baseTarget = getSlaTargetDate(
    baseCreatedAt,
    'Roads',
    'Roads'
  )

  const slaDurationMs = baseTarget.getTime() - now

  const createdAt = new Date(
    now + remainingMs - slaDurationMs
  )

  return {
    id,
    status,
    category: 'Roads',
    department: 'Roads',
    createdAt,
  }
}

function renderBanner(props) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  act(() => {
    root.render(<SlaEscalationBanner {...props} />)
  })

  return {
    container,
    root,
  }
}

describe('SlaEscalationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    document.body.innerHTML = ''
  })

  describe('getUrgentComplaints', () => {
    it('returns no complaints when all active tickets are more than 2 hours from SLA', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-101',
          now,
          remainingMs: 3 * 60 * 60 * 1000,
        }),
      ]

      expect(getUrgentComplaints(complaints, now)).toHaveLength(0)
    })

    it('includes a complaint exactly at the 2-hour urgent threshold', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-102',
          now,
          remainingMs: URGENT_THRESHOLD_MS,
        }),
      ]

      const urgent = getUrgentComplaints(complaints, now)

      expect(urgent).toHaveLength(1)
      expect(urgent[0].complaint.id).toBe('CC-102')
      expect(urgent[0].remainingMs).toBe(URGENT_THRESHOLD_MS)
    })

    it('includes already breached active complaints', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-103',
          now,
          remainingMs: -30 * 60 * 1000,
        }),
      ]

      const urgent = getUrgentComplaints(complaints, now)

      expect(urgent).toHaveLength(1)
      expect(urgent[0].complaint.id).toBe('CC-103')
      expect(urgent[0].remainingMs).toBe(-30 * 60 * 1000)
    })

    it('ignores resolved and rejected complaints', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-104',
          now,
          remainingMs: 30 * 60 * 1000,
          status: 'Resolved',
        }),
        complaintFromRemainingTime({
          id: 'CC-105',
          now,
          remainingMs: -30 * 60 * 1000,
          status: 'Rejected',
        }),
      ]

      expect(getUrgentComplaints(complaints, now)).toHaveLength(0)
    })

    it('sorts the most urgent complaint first', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-106',
          now,
          remainingMs: 90 * 60 * 1000,
        }),
        complaintFromRemainingTime({
          id: 'CC-107',
          now,
          remainingMs: 20 * 60 * 1000,
        }),
      ]

      const urgent = getUrgentComplaints(complaints, now)

      expect(urgent).toHaveLength(2)
      expect(urgent[0].complaint.id).toBe('CC-107')
      expect(urgent[1].complaint.id).toBe('CC-106')
    })
  })

  describe('Banner rendering', () => {
    it('returns no banner when there are no urgent tickets', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-108',
          now,
          remainingMs: 5 * 60 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets: vi.fn(),
      })

      expect(container.textContent).toBe('')

      act(() => root.unmount())
    })

    it('renders the urgent count and most urgent ticket ID', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-109',
          now,
          remainingMs: 90 * 60 * 1000,
        }),
        complaintFromRemainingTime({
          id: 'CC-110',
          now,
          remainingMs: 30 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets: vi.fn(),
      })

      expect(container.textContent).toContain(
        '2 tickets require immediate attention'
      )
      expect(container.textContent).toContain('CC-110')

      act(() => root.unmount())
    })

    it('shows the remaining countdown for an upcoming SLA', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-111',
          now,
          remainingMs: 90 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets: vi.fn(),
      })

      expect(container.textContent).toContain(
        '01h 30m 00s remaining'
      )

      act(() => root.unmount())
    })

    it('shows overdue time when the SLA has already been breached', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-112',
          now,
          remainingMs: -45 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets: vi.fn(),
      })

      expect(container.textContent).toContain(
        'Overdue by 00h 45m 00s'
      )
      expect(container.textContent).toContain(
        'Urgent SLA Escalation'
      )

      act(() => root.unmount())
    })

    it('calls the urgent-ticket filter callback when the button is clicked', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')
      const onShowUrgentTickets = vi.fn()

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-113',
          now,
          remainingMs: 30 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets,
      })

      const showButton = Array.from(
        container.querySelectorAll('button')
      ).find(
        (button) => button.textContent.includes('Show Urgent Tickets')
      )

      expect(showButton).toBeDefined()

      act(() => {
        showButton.click()
      })

      expect(onShowUrgentTickets).toHaveBeenCalledTimes(1)

      act(() => root.unmount())
    })

    it('dismisses the banner for the current session', () => {
      const now = Date.parse('2026-11-12T12:00:00Z')

      vi.spyOn(Date, 'now').mockReturnValue(now)

      const complaints = [
        complaintFromRemainingTime({
          id: 'CC-114',
          now,
          remainingMs: 30 * 60 * 1000,
        }),
      ]

      const { container, root } = renderBanner({
        complaints,
        onShowUrgentTickets: vi.fn(),
      })

      const dismissButton = container.querySelector(
        '[aria-label="Dismiss SLA escalation banner for this session"]'
      )

      expect(dismissButton).not.toBeNull()

      act(() => {
        dismissButton.click()
      })

      expect(
        sessionStorage.getItem(
          'civic-connect:sla-escalation-banner:dismissed'
        )
      ).toBe('true')

      act(() => root.unmount())
    })
  })
})