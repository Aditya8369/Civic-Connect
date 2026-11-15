// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportPage } from './ReportPage'
import { extractTextFromImage } from '@/utils/ocr'

const mockNavigate = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'citizen-1', name: 'Citizen' } }),
}))

vi.mock('@/firebase/services', () => ({ db: {} }))

vi.mock('@/firebase/endorseComplaint', () => ({
  endorseComplaint: vi.fn(),
}))

vi.mock('@/firebase/complaintId', () => ({
  generateComplaintId: vi.fn(),
  getDisplayId: vi.fn(() => 'CMP-2026-0001'),
}))

vi.mock('@/firebase/notifications', () => ({
  addNotificationToBatch: vi.fn(),
}))

vi.mock('@/firebase/complaintEvents', () => ({
  addComplaintEventToBatch: vi.fn(),
}))

vi.mock('@/firebase/storage', () => ({
  validateComplaintPhoto: () => ({ valid: true }),
  uploadComplaintPhoto: vi.fn(),
  uploadComplaintAudio: vi.fn(),
}))

vi.mock('@/utils/ocr', async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    extractTextFromImage: vi.fn(),
  }
})

vi.mock('@/components/citizen/VoiceRecorder', () => ({
  default: () => null,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children }) => children,
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ forEach: () => {} })),
}))

let container
let root

async function renderReportPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(<ReportPage />)
  })
}

async function uploadPhoto(file) {
  const input = container.querySelector('#complaint-photo')
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  })

  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function button(label) {
  return Array.from(container.querySelectorAll('button')).find((item) =>
    item.textContent.includes(label)
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container?.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
})

describe('Report page OCR suggestions', () => {
  it('suggests a title and address after a photo is uploaded', async () => {
    extractTextFromImage.mockResolvedValue(
      'Broken streetlight\n12 Main Street\nDowntown'
    )

    await renderReportPage()

    const file = new File(['photo'], 'streetlight.jpg', {
      type: 'image/jpeg',
    })
    await uploadPhoto(file)

    expect(extractTextFromImage).toHaveBeenCalledWith(file)
    // The suggestion panel appears, but the title is only filled when the
    // citizen explicitly chooses to apply it.
    expect(container.querySelector('#title').value).toBe('')
    expect(container.textContent).toContain('Text found in your photo')
    expect(button('Use as title')).toBeDefined()
    expect(button('Use as address')).toBeDefined()

    await act(async () => {
      button('Use as title').click()
    })

    expect(container.querySelector('#title').value).toBe('Broken streetlight')

    await act(async () => {
      button('Use as address').click()
    })

    expect(container.querySelector('#address').value).toBe('12 Main Street')
  })

  it('shows a suggestion button for retrying OCR without blocking the form', async () => {
    extractTextFromImage.mockResolvedValue('')
    await renderReportPage()

    const file = new File(['photo'], 'sign.png', { type: 'image/png' })
    await uploadPhoto(file)

    expect(container.textContent).toContain('No readable text found')
    expect(button('Suggest from photo')).toBeDefined()
    expect(container.querySelector('#description')).toBeDefined()
  })

  it('ignores unreadable OCR fragments instead of suggesting them', async () => {
    extractTextFromImage.mockResolvedValue('wR\noe ae a')

    await renderReportPage()

    await uploadPhoto(new File(['photo'], 'pothole.jpg', { type: 'image/jpeg' }))

    expect(container.querySelector('#title').value).toBe('')
    expect(container.textContent).toContain('No readable text found')
    expect(button('Use as title')).toBeUndefined()
  })

  it('fills the complaint title when Use as title is clicked', async () => {
    extractTextFromImage.mockResolvedValue('Pothole\n12 Main Street')

    await renderReportPage()

    await uploadPhoto(new File(['photo'], 'pothole.jpg', { type: 'image/jpeg' }))

    expect(container.querySelector('#title').value).toBe('')

    await act(async () => {
      button('Use as title').click()
    })

    expect(container.querySelector('#title').value).toBe('Pothole')
    expect(document.activeElement).toBe(container.querySelector('#title'))
  })

  it('does not overwrite a title the citizen already typed', async () => {
    extractTextFromImage.mockResolvedValue('12 Main Street')

    await renderReportPage()

    const titleInput = container.querySelector('#title')
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set

    await act(async () => {
      valueSetter.call(titleInput, 'My own title')
      titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await uploadPhoto(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }))

    expect(container.querySelector('#title').value).toBe('My own title')
  })

  it('puts the real address in the address field and keeps the issue out of it', async () => {
    extractTextFromImage.mockResolvedValue('Pothole\n12 Main Street')

    await renderReportPage()
    await uploadPhoto(new File(['photo'], 'pothole.jpg', { type: 'image/jpeg' }))

    await act(async () => {
      button('Use as address').click()
    })

    expect(container.querySelector('#address').value).toBe('12 Main Street')
    expect(container.querySelector('#title').value).toBe('')

    await act(async () => {
      button('Use as title').click()
    })

    expect(container.querySelector('#title').value).toBe('Pothole')
    expect(container.querySelector('#address').value).toBe('12 Main Street')
  })

  it('does not offer an issue label as an address', async () => {
    extractTextFromImage.mockResolvedValue('Water Leakage')

    await renderReportPage()
    await uploadPhoto(new File(['photo'], 'leak.jpg', { type: 'image/jpeg' }))

    expect(button('Use as address').disabled).toBe(true)

    await act(async () => {
      button('Use as title').click()
    })

    expect(container.querySelector('#title').value).toBe('Water Leakage')
    expect(container.querySelector('#address').value).toBe('')
  })
})
