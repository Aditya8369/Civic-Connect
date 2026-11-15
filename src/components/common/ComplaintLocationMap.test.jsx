// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { ComplaintLocationMapLeaflet as ComplaintLocationMap } from './ComplaintLocationMapLeaflet'

const mockMap = vi.hoisted(() => ({
  click: null,
  markerProps: null,
  setView: vi.fn(),
}))

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) =>
    createElement('div', { 'data-testid': 'map' }, children),

  TileLayer: () => createElement('div', { 'data-testid': 'tiles' }),

  Marker: (props) => {
    mockMap.markerProps = props

    return createElement(
      'button',
      {
        type: 'button',
        'aria-label': 'Selected map pin',
        onClick: () =>
          props.eventHandlers?.dragend?.({
            target: {
              getLatLng: () => ({ lat: 19.076, lng: 72.8777 }),
            },
          }),
      },
      'pin'
    )
  },

  useMap: () => ({
    setView: mockMap.setView,
    getZoom: () => 5,
  }),

  useMapEvents: (handlers) => {
    mockMap.click = handlers.click
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) =>
    createElement('button', props, children),
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function mount(element) {
  const container = document.createElement('div')
  document.body.appendChild(container)

  const root = createRoot(container)

  act(() => {
    root.render(
      createElement(LanguageProvider, null, element)
    )
  })

  return {
    container,
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('ComplaintLocationMap', () => {
  let mounted

  beforeEach(() => {
    localStorage.setItem('civic-connect-language', 'en')

    mockMap.click = null
    mockMap.markerProps = null
    mockMap.setView.mockClear()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          display_name: 'Test Street, Pune, India',
        }),
      })
    )
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
    vi.unstubAllGlobals()
  })

  it('renders OpenStreetMap tiles and a non-draggable existing pin in read-only mode', () => {
    mounted = mount(
      createElement(ComplaintLocationMap, {
        latitude: 19.076,
        longitude: 72.8777,
        address: 'Pune',
      })
    )

    expect(
      mounted.container.querySelector('[data-testid="tiles"]')
    ).not.toBeNull()

    expect(mounted.container.textContent).toContain('Pune')
    expect(mockMap.markerProps.draggable).toBe(false)

    expect(mockMap.setView).toHaveBeenCalledWith(
      [19.076, 72.8777],
      15,
      { animate: true }
    )
  })

  it('updates coordinates and reverse-geocoded address when the map is clicked', async () => {
    const onLocationSelect = vi.fn()

    mounted = mount(
      createElement(ComplaintLocationMap, {
        selectable: true,
        onLocationSelect,
      })
    )

    await act(async () => {
      mockMap.click({
        latlng: { lat: 18.5204, lng: 73.8567 },
      })

      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(onLocationSelect).toHaveBeenCalledWith({
      latitude: '18.520400',
      longitude: '73.856700',
      address: 'Test Street, Pune, India',
    })
  })

  it('keeps the selected pin draggable in selection mode', () => {
    mounted = mount(
      createElement(ComplaintLocationMap, {
        latitude: 18.52,
        longitude: 73.85,
        selectable: true,
        onLocationSelect: vi.fn(),
      })
    )

    expect(mockMap.markerProps.draggable).toBe(true)
  })

  it('preserves coordinates and reports a recoverable message when reverse geocoding fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new Error('Network unavailable')
      )
    )

    const onLocationSelect = vi.fn()

    mounted = mount(
      createElement(ComplaintLocationMap, {
        selectable: true,
        onLocationSelect,
      })
    )

    await act(async () => {
      mockMap.click({
        latlng: { lat: 18.5, lng: 73.8 },
      })

      await Promise.resolve()
    })

    expect(onLocationSelect).toHaveBeenCalledWith({
      latitude: '18.500000',
      longitude: '73.800000',
      address: '',
    })

    expect(mounted.container.textContent).toContain(
      'Network unavailable'
    )
  })
})
