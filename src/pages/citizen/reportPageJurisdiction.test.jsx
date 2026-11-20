// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '@/contexts/LanguageContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const toast = vi.fn()
  toast.success = vi.fn()
  toast.error = vi.fn()

  return {
    navigate: vi.fn(),
    saveOfflineComplaint: vi.fn(async () => ({ localId: 'mock-offline-id' })),
    runTransaction: vi.fn(),
    allocateComplaintId: vi.fn(async () => 'CMP-2026-1234'),
    addComplaintEventToBatch: vi.fn(),
    addNotificationToBatch: vi.fn(),
    toast,
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'citizen-user-1' } }),
}))

vi.mock('react-hot-toast', () => ({ default: mocks.toast }))

vi.mock('@/utils/offlineQueue', () => ({
  saveOfflineComplaint: mocks.saveOfflineComplaint,
}))

vi.mock('@/components/common/ComplaintLocationMap', () => ({
  ComplaintLocationMap: ({ onLocationSelect, latitude, longitude }) => (
    <div data-testid="mock-map">
      <button
        type="button"
        data-testid="select-connaught-place"
        onClick={() =>
          onLocationSelect({
            latitude: '28.6160',
            longitude: '77.2090',
            address: 'Connaught Place, New Delhi',
          })
        }
      >
        Select Connaught Place (Ward 1)
      </button>
      <button
        type="button"
        data-testid="select-out-of-bounds"
        onClick={() =>
          onLocationSelect({
            latitude: '12.9716',
            longitude: '77.5946',
            address: 'Bangalore City',
          })
        }
      >
        Select Bangalore
      </button>
      <span data-testid="map-coords">{`${latitude},${longitude}`}</span>
    </div>
  ),
}))

vi.mock('@/firebase/services', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ _col: name })),
  doc: vi.fn((_col, id) => ({ id: id || 'doc-id-123' })),
  runTransaction: mocks.runTransaction,
  serverTimestamp: () => ({ _type: 'serverTimestamp' }),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [], forEach: vi.fn() })),
}))

vi.mock('@/firebase/complaintId', () => ({
  allocateComplaintId: mocks.allocateComplaintId,
  getDisplayId: (c) => c?.complaintId || c?.id || 'CMP-2026-0000',
}))

vi.mock('@/firebase/complaintEvents', () => ({
  addComplaintEventToBatch: mocks.addComplaintEventToBatch,
}))

vi.mock('@/firebase/notifications', () => ({
  addNotificationToBatch: mocks.addNotificationToBatch,
}))

vi.mock('@/firebase/storage', () => ({
  validateComplaintPhoto: () => ({ valid: true }),
  uploadComplaintPhoto: vi.fn(),
  uploadComplaintAudio: vi.fn(),
  deleteComplaintEvidence: vi.fn(),
}))

vi.mock('@/components/citizen/VoiceRecorder', () => ({
  default: () => <div data-testid="mock-voice-recorder" />,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }) => (
    <select
      data-testid="mock-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ value, children }) => <option value={value}>{children ?? value}</option>,
}))

import { ReportPage } from './ReportPage'

let container
let root

function setInputValue(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  ).set
  valueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function setTextareaValue(textarea, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  ).set
  valueSetter.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  textarea.dispatchEvent(new Event('change', { bubbles: true }))
}

async function renderPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <LanguageProvider>
        <ReportPage />
      </LanguageProvider>
    )
  })
}

describe('ReportPage Jurisdiction & Ward Detection Integration (Issue #251)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    if (root) {
      await act(async () => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  it('renders without jurisdiction badge initially when coordinates are blank', async () => {
    await renderPage()
    const badge = container.querySelector('[data-testid="jurisdiction-routing-badge"]')
    expect(badge).toBeNull()
  })

  it('updates jurisdiction badge to Ward 01 when map selects coordinates inside Ward 01', async () => {
    await renderPage()
    const selectBtn = container.querySelector('[data-testid="select-connaught-place"]')
    expect(selectBtn).not.toBeNull()

    await act(async () => {
      selectBtn.click()
    })

    // Advance past debounce timer
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const badge = container.querySelector('[data-testid="jurisdiction-routing-badge"]')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toContain('WARD-01')
    expect(badge.textContent).toContain('Central Civic Core & Connaught Ward')
    expect(badge.textContent).toContain('New Delhi Central Zone (Zone A)')
    expect(badge.textContent).toContain('Rajeshwar Kulkarni')
    expect(badge.textContent).toContain('1800-11-2201')
  })

  it('displays out of boundary fallback information when coordinates are outside municipal limits', async () => {
    await renderPage()
    const selectOutOfBounds = container.querySelector('[data-testid="select-out-of-bounds"]')

    await act(async () => {
      selectOutOfBounds.click()
    })

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const badge = container.querySelector('[data-testid="jurisdiction-routing-badge"]')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toContain('Location outside mapped ward boundaries')
    expect(badge.textContent).toContain('Central Municipal Headquarters')
  })

  it('displays invalid coordinates warning when non-numeric or range-violating values are entered', async () => {
    await renderPage()
    const latInput = container.querySelector('#latitude')
    const lngInput = container.querySelector('#longitude')

    await act(async () => {
      setInputValue(latInput, '999')
      setInputValue(lngInput, '77.209')
    })

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    const badge = container.querySelector('[data-testid="jurisdiction-routing-badge"]')
    expect(badge).not.toBeNull()
    expect(badge.textContent).toContain('Invalid coordinates entered')
  })

  it('includes wardId, ward, and zoneName in submission payload when submitting online', async () => {
    let committedPayload = null
    const mockTx = {
      set: vi.fn((_ref, data) => {
        if (data && data.complaintId) {
          committedPayload = data
        }
      }),
    }
    mocks.runTransaction.mockImplementation(async (_db, fn) => fn(mockTx))

    await renderPage()

    // Fill Title
    await act(async () => {
      vi.advanceTimersByTime(70000)
    })

    const titleInput = container.querySelector('#title')
    await act(async () => {
      setInputValue(titleInput, 'Pothole in Ward 1')
    })

    // Fill Description
    const descInput = container.querySelector('#description')
    await act(async () => {
      setTextareaValue(descInput, 'Deep hole on the inner circle road')
    })

    // Select category
    const selectEl = container.querySelector('[data-testid="mock-select"]')
    await act(async () => {
      selectEl.value = 'Potholes & Road Damage'
      selectEl.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Fill address
    const addressInput = container.querySelector('#address')
    await act(async () => {
      setInputValue(addressInput, 'Connaught Place, Ward 1')
    })

    // Select location
    const selectBtn = container.querySelector('[data-testid="select-connaught-place"]')
    await act(async () => {
      selectBtn.click()
    })

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // Submit form
    // Submit form
    const form = container.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(committedPayload).not.toBeNull()
    expect(committedPayload.wardId).toBe('WARD-01')
    expect(committedPayload.ward).toBe('WARD-01')
    expect(committedPayload.zoneName).toBe('New Delhi Central Zone (Zone A)')
  })

  it('includes resolved jurisdiction fields when submitting offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    // Advance real time by 70s so Date.now() - inMemoryLastSubmittedAt > 60s
    vi.setSystemTime(Date.now() + 70000)

    await renderPage()

    await act(async () => {
      vi.advanceTimersByTime(70000)
    })

    const titleInput = container.querySelector('#title')
    await act(async () => {
      setInputValue(titleInput, 'Offline Pothole')
    })

    const descInput = container.querySelector('#description')
    await act(async () => {
      setTextareaValue(descInput, 'Deep road hazard reported without internet')
    })

    const selectEl = container.querySelector('[data-testid="mock-select"]')
    await act(async () => {
      selectEl.value = 'Potholes & Road Damage'
      selectEl.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const addressInput = container.querySelector('#address')
    await act(async () => {
      setInputValue(addressInput, 'Connaught Place Offline Address')
    })

    const selectBtn = container.querySelector('[data-testid="select-connaught-place"]')
    await act(async () => {
      selectBtn.click()
    })

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // Submit form
    const form = container.querySelector('form')
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(mocks.saveOfflineComplaint).toHaveBeenCalled()
    const queuedData = mocks.saveOfflineComplaint.mock.calls[0][0]
    expect(queuedData.wardId).toBe('WARD-01')
    expect(queuedData.ward).toBe('WARD-01')
    expect(queuedData.zoneName).toBe('New Delhi Central Zone (Zone A)')
    expect(queuedData.jurisdictionMeta).toBeDefined()
  })
})
