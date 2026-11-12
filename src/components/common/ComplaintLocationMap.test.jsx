import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ComplaintLocationMap } from './ComplaintLocationMap'

const mockMap = vi.hoisted(() => ({
  click: null,
  position: [19.076, 72.8777],
  markerProps: null,
}))

vi.mock('leaflet', () => ({
  default: {
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => <div data-testid="tiles" />,
  Marker: (props) => {
    mockMap.markerProps = props
    return <button type="button" aria-label="Selected map pin" onClick={() => props.eventHandlers?.dragend?.({ target: { getLatLng: () => ({ lat: 19.076, lng: 72.8777 }) } })}>pin</button>
  },
  useMapEvents: (handlers) => { mockMap.click = handlers.click },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}))

describe('ComplaintLocationMap', () => {
  beforeEach(() => {
    mockMap.click = null
    mockMap.markerProps = null
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Test Street, Pune, India' }),
    }))
  })

  it('renders OpenStreetMap tiles and a non-draggable existing pin in read-only mode', () => {
    render(<ComplaintLocationMap latitude={19.076} longitude={72.8777} address="Pune" />)
    expect(screen.getByTestId('tiles')).toBeTruthy()
    expect(screen.getByText('Pune')).toBeTruthy()
    expect(mockMap.markerProps.draggable).toBe(false)
  })

  it('updates coordinates and reverse-geocoded address when the map is clicked', async () => {
    const onLocationSelect = vi.fn()
    render(<ComplaintLocationMap selectable onLocationSelect={onLocationSelect} />)
    mockMap.click({ latlng: { lat: 18.5204, lng: 73.8567 } })
    await waitFor(() => expect(onLocationSelect).toHaveBeenCalledWith({
      latitude: '18.520400',
      longitude: '73.856700',
      address: 'Test Street, Pune, India',
    }))
  })

  it('keeps the selected pin draggable in selection mode', () => {
    render(<ComplaintLocationMap latitude={18.52} longitude={73.85} selectable onLocationSelect={vi.fn()} />)
    expect(mockMap.markerProps.draggable).toBe(true)
  })

  it('preserves coordinates and reports a recoverable message when reverse geocoding fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')))
    const onLocationSelect = vi.fn()
    render(<ComplaintLocationMap selectable onLocationSelect={onLocationSelect} />)
    mockMap.click({ latlng: { lat: 18.5, lng: 73.8 } })
    await waitFor(() => expect(onLocationSelect).toHaveBeenCalledWith({
      latitude: '18.500000',
      longitude: '73.800000',
      address: '',
    }))
    expect(await screen.findByText('Network unavailable')).toBeTruthy()
  })
})
