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
      value: 'emergency',
      label: 'Emergency alert',
      description: 'Immediate danger or critical incident',
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

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Polygon: ({ children, positions, pathOptions }) => (
    <div
      data-testid="map-polygon"
      data-positions={JSON.stringify(positions)}
      data-pathoptions={JSON.stringify(pathOptions)}
    >
      {children}
    </div>
  ),
  Circle: ({ children, center, radius, pathOptions }) => (
    <div
      data-testid="map-circle"
      data-center={JSON.stringify(center)}
      data-radius={radius}
      data-pathoptions={JSON.stringify(pathOptions)}
    >
      {children}
    </div>
  ),
  Marker: ({ children, position }) => (
    <div data-testid="map-marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  useMapEvents: vi.fn(),
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

  it('allows selecting a municipal ward and publishes geofenced ward broadcast', async () => {
    await renderPage()
    emitBroadcast(null)

    const wardButton = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent.includes('Municipal Ward')
    )
    expect(wardButton).not.toBeNull()

    await act(async () => {
      wardButton.click()
    })

    await setInput(container.querySelector('#broadcast-title'), 'Ward 2 Pipeline Burst')
    await setTextarea(
      container.querySelector('#broadcast-message'),
      'Drinking water disruption in Ward 2 for 4 hours.'
    )

    const wardSelect = container.querySelector('[data-testid="broadcast-ward-select"]')
    expect(wardSelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(wardSelect, 'WARD-02')
      wardSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      submitButton().click()
    })

    expect(rt.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ward 2 Pipeline Burst',
        message: 'Drinking water disruption in Ward 2 for 4 hours.',
        targetType: 'ward',
        targetWard: expect.objectContaining({
          wardId: 'WARD-02',
        }),
      }),
      { actorUid: 'admin-1' }
    )
    expect(toast.success).toHaveBeenCalledWith(
      'Municipal alert published with geofenced targeting'
    )
  })

  it('allows radius targeting with customizable metres', async () => {
    await renderPage()
    emitBroadcast(null)

    const radiusButton = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent.includes('Target Radius')
    )
    expect(radiusButton).not.toBeNull()

    await act(async () => {
      radiusButton.click()
    })

    await setInput(container.querySelector('#broadcast-title'), 'Chemical Spill Advisory')
    await setTextarea(
      container.querySelector('#broadcast-message'),
      'Maintain 2km exclusion zone around factory junction.'
    )

    const radiusSelect = container.querySelector('[data-testid="broadcast-radius-select"]')
    expect(radiusSelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(radiusSelect, '2000')
      radiusSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      submitButton().click()
    })

    expect(rt.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Chemical Spill Advisory',
        message: 'Maintain 2km exclusion zone around factory junction.',
        targetType: 'radius',
        targetRadius: 2000,
      }),
      { actorUid: 'admin-1' }
    )
  })

  it('enforces at least 3 points when draw polygon mode is chosen', async () => {
    await renderPage()
    emitBroadcast(null)

    const polygonButton = [...container.querySelectorAll('button')].find((btn) =>
      btn.textContent.includes('Draw Polygon')
    )
    expect(polygonButton).not.toBeNull()

    await act(async () => {
      polygonButton.click()
    })

    await setInput(container.querySelector('#broadcast-title'), 'Custom Zone Warning')
    await setTextarea(container.querySelector('#broadcast-message'), 'Stay out of demarcated perimeter.')

    await act(async () => {
      submitButton().click()
    })

    expect(rt.publish).not.toHaveBeenCalled()
    expect(container.textContent).toContain('define at least 3 points')
  })
})
