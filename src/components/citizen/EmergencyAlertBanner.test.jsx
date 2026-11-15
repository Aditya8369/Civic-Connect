// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rt = vi.hoisted(() => ({
  onChange: null,
  onError: null,
  unsubscribe: null,
}))

vi.mock('@/firebase/emergencyBroadcasts', () => ({
  DEFAULT_BROADCAST_SEVERITY: 'warning',
  listenToActiveEmergencyBroadcast: vi.fn((onChange, options) => {
    rt.onChange = onChange
    rt.onError = options?.onError
    rt.unsubscribe = vi.fn()
    return rt.unsubscribe
  }),
}))

import {
  EmergencyAlertBanner,
  EmergencyAlertBannerView,
} from './EmergencyAlertBanner'
import {
  EMERGENCY_BANNER_DISMISS_KEY,
  getBroadcastDismissKey,
} from '@/utils/emergencyBroadcastDismissal'

let container
let root

function renderBanner() {
  act(() => {
    root.render(<EmergencyAlertBanner />)
  })
}

function emitBroadcast(broadcast) {
  act(() => {
    rt.onChange(broadcast)
  })
}

function latestBanner() {
  return [...container.querySelectorAll('[data-testid="emergency-alert-banner"]')].at(-1)
}

const criticalBroadcast = {
  id: 'broadcast-1',
  title: 'Flash flood warning',
  message: 'Move to higher ground immediately.',
  severity: 'critical',
  active: true,
  createdAt: new Date('2026-11-14T09:00:00Z'),
}

beforeEach(() => {
  rt.onChange = null
  rt.onError = null
  rt.unsubscribe = null
  localStorage.clear()
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
  vi.restoreAllMocks()
})

describe('EmergencyAlertBanner', () => {
  it('subscribes to the live broadcast feed and unsubscribes on unmount', () => {
    renderBanner()

    expect(rt.onChange).toEqual(expect.any(Function))
    expect(rt.unsubscribe).not.toBeNull()

    act(() => {
      root.unmount()
    })

    expect(rt.unsubscribe).toHaveBeenCalledTimes(1)
    root = createRoot(container)
  })

  it('renders nothing until an active broadcast arrives', () => {
    renderBanner()

    expect(container.innerHTML).toBe('')

    emitBroadcast(null)

    expect(container.innerHTML).toBe('')
  })

  it('renders the alert title, message, severity, and published time', () => {
    renderBanner()
    emitBroadcast(criticalBroadcast)

    const banner = container.querySelector(
      '[data-testid="emergency-alert-banner"]'
    )

    expect(banner).not.toBeNull()
    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.getAttribute('data-severity')).toBe('critical')
    expect(container.textContent).toContain('Emergency alert')
    expect(container.textContent).toContain('Flash flood warning')
    expect(container.textContent).toContain(
      'Move to higher ground immediately.'
    )
    expect(container.textContent).not.toBe('')
  })

  it('applies distinct severity styling for info and warning alerts', () => {
    renderBanner()

    emitBroadcast({
      ...criticalBroadcast,
      id: 'info-1',
      severity: 'info',
      title: 'Public notice',
    })

    let banner = latestBanner()
    expect(banner.getAttribute('data-severity')).toBe('info')
    expect(banner.className).toContain('bg-blue-50')
    expect(container.textContent).toContain('Public notice')

    emitBroadcast({
      ...criticalBroadcast,
      id: 'warning-1',
      severity: 'warning',
      title: 'Water shutdown',
    })

    banner = latestBanner()
    expect(banner.getAttribute('data-severity')).toBe('warning')
    expect(banner.className).toContain('bg-amber-50')
    expect(container.textContent).toContain('Citywide advisory')
  })

  it('stores the dismissal for that specific alert', () => {
    renderBanner()
    emitBroadcast(criticalBroadcast)

    const dismissButton = container.querySelector(
      '[aria-label="Dismiss emergency alert"]'
    )

    expect(dismissButton).not.toBeNull()

    act(() => {
      dismissButton.click()
    })

    expect(localStorage.getItem(EMERGENCY_BANNER_DISMISS_KEY)).toBe(
      'broadcast-1'
    )
  })

  it('honours a previous dismissal saved in local storage', () => {
    localStorage.setItem(EMERGENCY_BANNER_DISMISS_KEY, 'broadcast-1')

    renderBanner()
    emitBroadcast(criticalBroadcast)

    expect(
      container.querySelector('[data-testid="emergency-alert-banner"]')
    ).toBeNull()

    emitBroadcast({ ...criticalBroadcast, id: 'broadcast-2' })

    expect(
      container.querySelector('[data-testid="emergency-alert-banner"]')
    ).not.toBeNull()
  })

  it('shows a newer alert even after the previous one was dismissed', () => {
    localStorage.setItem(EMERGENCY_BANNER_DISMISS_KEY, 'broadcast-1')

    renderBanner()
    emitBroadcast({ ...criticalBroadcast, id: 'broadcast-2', title: 'New storm' })

    expect(container.textContent).toContain('New storm')
  })

  it('logs listener failures without crashing the portal', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBanner()

    act(() => {
      rt.onError(new Error('permission denied'))
    })

    expect(errorSpy).toHaveBeenCalledWith(
      'Emergency broadcast listener error:',
      expect.any(Error)
    )
  })

  it('builds a stable dismiss key from the broadcast ID', () => {
    expect(getBroadcastDismissKey(null)).toBe('')
    expect(getBroadcastDismissKey({ id: 'abc' })).toBe('abc')
    expect(
      getBroadcastDismissKey({ title: 'Title', message: 'Body' })
    ).toBe('Title:Body')
  })
})

describe('EmergencyAlertBannerView', () => {
  it('omits the dismiss control in preview mode', () => {
    act(() => {
      root.render(
        <EmergencyAlertBannerView broadcast={criticalBroadcast} preview />
      )
    })

    expect(container.textContent).toContain('Flash flood warning')
    expect(container.querySelector('button')).toBeNull()
  })

  it('falls back to the warning style for an unknown severity', () => {
    act(() => {
      root.render(
        <EmergencyAlertBannerView
          broadcast={{ ...criticalBroadcast, severity: 'unknown' }}
        />
      )
    })

    const banner = container.querySelector(
      '[data-testid="emergency-alert-banner"]'
    )
    expect(banner.getAttribute('data-severity')).toBe('unknown')
    expect(banner.className).toContain('bg-amber-50')
  })
})
