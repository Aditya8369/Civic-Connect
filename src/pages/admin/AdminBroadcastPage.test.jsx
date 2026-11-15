// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const rt = vi.hoisted(() => ({
  onChange: null,
  onError: null,
  unsubscribe: null,
  publish: vi.fn(),
  deactivate: vi.fn(),
}))

vi.mock('@/firebase/emergencyBroadcasts', () => ({
  BROADCAST_TITLE_MAX_LENGTH: 120,
  BROADCAST_MESSAGE_MAX_LENGTH: 600,
  BROADCAST_SEVERITIES: [
    { value: 'info', label: 'Information', description: 'Routine citywide notice' },
    {
      value: 'warning',
      label: 'Advisory',
      description: 'Disruption or service interruption',
    },
    {
      value: 'critical',
      label: 'Critical emergency',
      description: 'Immediate danger to residents',
    },
  ],
  DEFAULT_BROADCAST_SEVERITY: 'warning',
  listenToActiveEmergencyBroadcast: vi.fn((onChange, options) => {
    rt.onChange = onChange
    rt.onError = options?.onError
    rt.unsubscribe = vi.fn()
    return rt.unsubscribe
  }),
  publishEmergencyBroadcast: rt.publish,
  deactivateEmergencyBroadcast: rt.deactivate,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'admin-1' } }),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import toast from 'react-hot-toast'
import { AdminBroadcastPage } from './AdminBroadcastPage'

let container
let root

async function renderPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(<AdminBroadcastPage />)
  })
}

function emitBroadcast(broadcast) {
  act(() => {
    rt.onChange(broadcast)
  })
}

async function setField(element, value, prototype) {
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set
  await act(async () => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const setInput = (element, value) =>
  setField(element, value, HTMLInputElement.prototype)
const setTextarea = (element, value) =>
  setField(element, value, HTMLTextAreaElement.prototype)

function submitButton() {
  return container.querySelector('form button[type="submit"]')
}

beforeEach(() => {
  rt.onChange = null
  rt.onError = null
  rt.unsubscribe = null
  rt.publish.mockReset().mockResolvedValue('broadcast-new')
  rt.deactivate.mockReset().mockResolvedValue(undefined)
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  container = null
  root = null
})

describe('AdminBroadcastPage', () => {
  it('loads the active broadcast in real time', async () => {
    await renderPage()

    expect(container.textContent).toContain('Loading the current alert')

    emitBroadcast({
      id: 'live-1',
      title: 'Water shutdown in Ward 4',
      message: 'Supply will stop from 10am to 2pm.',
      severity: 'warning',
    })

    expect(container.textContent).toContain('Water shutdown in Ward 4')
    expect(container.textContent).toContain('Live for all citizens')
    expect(container.textContent).toContain('End Broadcast')
  })

  it('shows an empty state when no alert is active', async () => {
    await renderPage()
    emitBroadcast(null)

    expect(container.textContent).toContain('No citywide alert is active')
    expect(container.textContent).toContain('Publish Alert')
  })

  it('validates that both a title and message are provided', async () => {
    await renderPage()
    emitBroadcast(null)

    await act(async () => {
      submitButton().click()
    })

    expect(container.textContent).toContain('Enter a short alert title')
    expect(rt.publish).not.toHaveBeenCalled()

    await setInput(container.querySelector('#broadcast-title'), 'Storm')

    await act(async () => {
      submitButton().click()
    })

    expect(container.textContent).toContain(
      'Enter the message citizens should see'
    )
    expect(rt.publish).not.toHaveBeenCalled()
  })

  it('publishes the composed alert with the selected severity', async () => {
    await renderPage()
    emitBroadcast(null)

    await setInput(
      container.querySelector('#broadcast-title'),
      '  Flash flood warning  '
    )
    await setTextarea(
      container.querySelector('#broadcast-message'),
      '  Move to higher ground.  '
    )

    const severity = container.querySelector('#broadcast-severity')
    await act(async () => {
      severity.value = 'critical'
      severity.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      submitButton().click()
    })

    expect(rt.publish).toHaveBeenCalledWith(
      {
        title: 'Flash flood warning',
        message: 'Move to higher ground.',
        severity: 'critical',
      },
      { actorUid: 'admin-1' }
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Emergency alert published to all citizens'
    )
    expect(container.querySelector('#broadcast-title').value).toBe('')
    expect(container.querySelector('#broadcast-message').value).toBe('')
  })

  it('keeps the composed text and reports a toast when publishing fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    rt.publish.mockRejectedValue(new Error('network down'))

    await renderPage()
    emitBroadcast(null)

    await setInput(container.querySelector('#broadcast-title'), 'Storm')
    await setTextarea(container.querySelector('#broadcast-message'), 'Stay in.')

    await act(async () => {
      submitButton().click()
    })

    expect(toast.error).toHaveBeenCalledWith(
      'Could not publish the emergency alert'
    )
    expect(container.querySelector('#broadcast-title').value).toBe('Storm')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('ends the active broadcast', async () => {
    await renderPage()
    emitBroadcast({
      id: 'live-1',
      title: 'Water shutdown',
      message: 'Supply stopped.',
      severity: 'warning',
    })

    const endButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent.includes('End Broadcast')
    )

    await act(async () => {
      endButton.click()
    })

    expect(rt.deactivate).toHaveBeenCalledWith('live-1', {
      actorUid: 'admin-1',
    })
    expect(toast.success).toHaveBeenCalledWith('Citywide alert ended')
    expect(container.textContent).toContain('No citywide alert is active')
  })

  it('reports a listener failure without breaking the composer', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderPage()

    act(() => {
      rt.onError(new Error('permission denied'))
    })

    expect(
      container.textContent
    ).toContain('Could not load the current citywide alert.')
    expect(container.querySelector('#broadcast-title')).not.toBeNull()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('previews the composer content with the chosen severity', async () => {
    await renderPage()
    emitBroadcast(null)

    expect(container.textContent).toContain('Your alert title')

    await setInput(container.querySelector('#broadcast-title'), 'Road closure')

    expect(container.textContent).toContain('Road closure')
  })
})
