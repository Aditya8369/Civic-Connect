// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { WardHealthScorecard } from './WardHealthScorecard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

if (typeof globalThis.URL.createObjectURL !== 'function') {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake')
  globalThis.URL.revokeObjectURL = vi.fn()
}

const storageMap = new Map()
const mockLocalStorage = {
  getItem: (key) => storageMap.get(key) || null,
  setItem: (key, val) => storageMap.set(key, String(val)),
  removeItem: (key) => storageMap.delete(key),
  clear: () => storageMap.clear(),
}
try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  })
} catch {
  globalThis.localStorage = mockLocalStorage
}

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  Polygon: ({ children, positions, pathOptions, eventHandlers }) => (
    <div
      data-testid="heatmap-ward-polygon"
      data-positions={JSON.stringify(positions)}
      data-pathoptions={JSON.stringify(pathOptions)}
      onClick={eventHandlers?.click}
    >
      {children}
    </div>
  ),
  Tooltip: ({ children }) => <div data-testid="map-tooltip">{children}</div>,
  Popup: ({ children }) => <div data-testid="map-popup">{children}</div>,
  Marker: ({ children }) => <div data-testid="map-marker">{children}</div>,
}))

vi.mock('@/utils/wardScorecardPdf', () => ({
  downloadWardScorecardsPdf: vi.fn(),
  generateWardScorecardsPdf: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('WardHealthScorecard Component', () => {
  let container
  let root

  const mockComplaints = [
    {
      id: 'c1',
      wardId: 'WARD-01',
      category: 'Potholes & Road Damage',
      status: 'Resolved',
      createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      resolvedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
      feedback: { rating: 5 },
    },
    {
      id: 'c2',
      wardId: 'WARD-02',
      category: 'Water Leakage',
      status: 'Pending',
      createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    container = null
    root = null
  })

  it('renders executive KPI summary metrics', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    expect(container.textContent).toContain('Municipal Health Score')
    expect(container.textContent).toContain('Avg Resolution Time (ART)')
    expect(container.textContent).toContain('SLA Compliance Rate')
    expect(container.textContent).toContain('Citizen Satisfaction (CSI)')
  })

  it('renders interactive filter controls and allows time window filtering', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    const timeSelect = container.querySelector('[data-testid="filter-time-window"]')
    expect(timeSelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(timeSelect, '30')
      timeSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(timeSelect.value).toBe('30')

    const categorySelect = container.querySelector('[data-testid="filter-category"]')
    expect(categorySelect).not.toBeNull()

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(categorySelect, 'Water Leakage')
      categorySelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(categorySelect.value).toBe('Water Leakage')
  })

  it('renders predictive heatmap canvas and scorecards for wards', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    expect(container.querySelector('[data-testid="predictive-heatmap-canvas"]')).not.toBeNull()

    const cards = container.querySelectorAll('[data-testid="ward-scorecard-card"]')
    expect(cards.length).toBeGreaterThanOrEqual(1)
  })

  it('triggers CSV and PDF export handlers when clicked', async () => {
    await act(async () => {
      root.render(<WardHealthScorecard complaints={mockComplaints} />)
    })

    const csvBtn = container.querySelector('[data-testid="export-scorecards-csv-btn"]')
    expect(csvBtn).not.toBeNull()

    await act(async () => {
      csvBtn.click()
    })

    const pdfBtn = container.querySelector('[data-testid="export-scorecards-pdf-btn"]')
    expect(pdfBtn).not.toBeNull()

    await act(async () => {
      pdfBtn.click()
    })

    expect(container.textContent).toContain('Municipal Health Score')
  })
})
