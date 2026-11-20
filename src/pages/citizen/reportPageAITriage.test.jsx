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
  toast.info = vi.fn()

  return {
    navigate: vi.fn(),
    saveOfflineComplaint: vi.fn(async () => ({ localId: 'mock-offline-id' })),
    runTransaction: vi.fn(),
    allocateComplaintId: vi.fn(async () => 'CMP-2026-5555'),
    addComplaintEventToBatch: vi.fn(),
    addNotificationToBatch: vi.fn(),
    analyzeComplaintPhoto: vi.fn(),
    uploadComplaintPhoto: vi.fn(async () => ({
      path: 'complaint-photos/doc-123/pothole.jpg',
      downloadUrl: 'https://storage.googleapis.com/test-bucket/pothole.jpg',
      filename: 'pothole.jpg',
      size: 1024,
      contentType: 'image/jpeg',
    })),
    toast,
  }
})

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'citizen-ai-user-1' } }),
}))

vi.mock('react-hot-toast', () => ({ default: mocks.toast }))

vi.mock('@/utils/offlineQueue', () => ({
  saveOfflineComplaint: mocks.saveOfflineComplaint,
}))

vi.mock('@/utils/aiTriage', () => ({
  analyzeComplaintPhoto: (...args) => mocks.analyzeComplaintPhoto(...args),
  DEPARTMENT_CATEGORIES: {
    Roads: 'Potholes & Road Damage',
    Water: 'Water Leakage',
    Sanitation: 'Garbage & Sanitation',
    Electricity: 'Streetlight Issues',
    'Public Safety': 'Traffic Issues',
  },
  CATEGORY_TO_DEPARTMENT: {
    'Potholes & Road Damage': 'Roads',
    'Streetlight Issues': 'Electricity',
    'Water Leakage': 'Water',
    'Garbage & Sanitation': 'Sanitation',
    'Traffic Issues': 'Public Safety',
  },
}))

vi.mock('@/utils/ocr', () => ({
  extractTextFromImage: vi.fn(async () => ''),
  cleanOCRText: vi.fn(() => ''),
  buildOCRSuggestions: vi.fn(() => ({})),
  terminateWorker: vi.fn(),
}))

vi.mock('@/components/common/ComplaintLocationMap', () => ({
  ComplaintLocationMap: () => <div data-testid="mock-map" />,
}))

vi.mock('@/firebase/services', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ _col: name })),
  doc: vi.fn((_col, id) => ({ id: id || 'doc-ai-123' })),
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
  validateComplaintPhoto: vi.fn(() => ({ valid: true })),
  uploadComplaintPhoto: (...args) => mocks.uploadComplaintPhoto(...args),
  uploadComplaintAudio: vi.fn(),
  deleteComplaintEvidence: vi.fn(),
}))

describe('ReportPage AI Multimodal Vision Triage Integration', () => {
  let container
  let root
  let ReportPage

  beforeEach(async () => {
    vi.clearAllMocks()
    localStorage.clear()

    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url')
    globalThis.URL.revokeObjectURL = vi.fn()

    const mod = await import('./ReportPage')
    ReportPage = mod.ReportPage

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
  })

  const renderComponent = () => {
    act(() => {
      root.render(
        <LanguageProvider>
          <ReportPage />
        </LanguageProvider>
      )
    })
  }

  it('triggers AI triage on photo selection and auto-populates category, title, and description', async () => {
    mocks.analyzeComplaintPhoto.mockResolvedValueOnce({
      category: 'Potholes & Road Damage',
      department: 'Roads',
      confidence: 0.94,
      severity: 'High',
      severityReason: 'Large deep crater in road asphalt',
      suggestedTitle: 'Dangerous crater on roadway',
      suggestedDescription: 'Hazardous asphalt pothole causing traffic obstruction.',
      source: 'gemini',
    })

    renderComponent()

    const fileInput = container.querySelector('input[type="file"]')
    const file = new File(['mock-image-bytes'], 'crater.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
      })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Expect analyzeComplaintPhoto to have been called with the file
    expect(mocks.analyzeComplaintPhoto).toHaveBeenCalledTimes(1)
    expect(mocks.analyzeComplaintPhoto).toHaveBeenCalledWith(file)

    // Verify AI triage card renders
    const triageCard = container.querySelector('[data-testid="ai-triage-card"]')
    expect(triageCard).not.toBeNull()
    expect(triageCard.textContent).toContain('Potholes & Road Damage')
    expect(triageCard.textContent).toContain('94% confidence')
    expect(triageCard.textContent).toContain('High')

    // Verify draft title and description were auto-populated
    const titleInput = container.querySelector('#title')
    const descInput = container.querySelector('#description')
    expect(titleInput.value).toBe('Dangerous crater on roadway')
    expect(descInput.value).toBe('Hazardous asphalt pothole causing traffic obstruction.')

    // Verify auto-populated notice is shown
    expect(container.querySelector('[data-testid="ai-auto-populated-notice"]')).not.toBeNull()
  })

  it('allows citizens to override the suggested category before submitting', async () => {
    mocks.analyzeComplaintPhoto.mockResolvedValueOnce({
      category: 'Potholes & Road Damage',
      department: 'Roads',
      confidence: 0.91,
      severity: 'Medium',
      suggestedTitle: 'Road crater',
      suggestedDescription: 'Pavement issues',
      source: 'gemini',
    })

    renderComponent()

    const fileInput = container.querySelector('input[type="file"]')
    const file = new File(['mock-image-bytes'], 'road.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
      })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    // Now citizen overrides title and description
    const titleInput = container.querySelector('#title')
    await act(async () => {
      titleInput.value = 'Citizen Custom Title'
      titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(titleInput.value).toBe('Citizen Custom Title')
  })

  it('clears AI triage results when the photo is removed', async () => {
    mocks.analyzeComplaintPhoto.mockResolvedValueOnce({
      category: 'Streetlight Issues',
      department: 'Electricity',
      confidence: 0.85,
      severity: 'Low',
      suggestedTitle: 'Broken light',
      suggestedDescription: 'Street light broken',
    })

    renderComponent()

    const fileInput = container.querySelector('input[type="file"]')
    const file = new File(['mock-image-bytes'], 'light.jpg', { type: 'image/jpeg' })

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: true,
      })
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="ai-triage-card"]')).not.toBeNull()

    // Click remove photo
    const removeBtn = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent.includes('Remove')
    )
    expect(removeBtn).toBeDefined()

    await act(async () => {
      removeBtn.click()
    })

    // AI Triage card should no longer be in the document
    expect(container.querySelector('[data-testid="ai-triage-card"]')).toBeNull()
  })
})
