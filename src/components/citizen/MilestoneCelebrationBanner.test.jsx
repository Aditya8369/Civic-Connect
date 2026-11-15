// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MilestoneCelebrationBanner } from './MilestoneCelebrationBanner'
import { BeforeAfterComparisonSlider } from './BeforeAfterComparisonSlider'
import { ConfettiBurst } from './ConfettiBurst'
import toast from 'react-hot-toast'
import { LanguageProvider } from '@/contexts/LanguageContext'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockLocalStorage = (() => {
  let store = {}
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => {
      store[key] = String(value)
    }),
    removeItem: vi.fn((key) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}))

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null
}

let container = null
let root = null

function renderComponent(ui) {
  act(() => {
    root.render(
      <LanguageProvider>
        {ui}
      </LanguageProvider>
    )
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  localStorage.clear()
  localStorage.setItem('civic-connect-language', 'en')
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

describe('MilestoneCelebrationBanner Component', () => {
  it('returns null when complaint is missing', () => {
    renderComponent(<MilestoneCelebrationBanner complaint={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('returns null when complaint status is not "Resolved"', () => {
    const complaint = {
      id: 'issue-1',
      status: 'In Progress',
      title: 'Pothole on Main St',
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders celebratory banner when complaint status is "Resolved"', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      title: 'Pothole on Main St',
      department: 'Roads',
      endorsementCount: 4,
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    expect(container.querySelector('[data-testid="milestone-celebration-banner"]')).not.toBeNull()
    expect(container.textContent).toContain('Civic Milestone Achieved')
    expect(container.textContent).toContain('Neighborhood Issue Resolved!')
  })

  it('safely extracts photo URLs whether formatted as strings or upload objects', () => {
    const complaint = {
      id: 'issue-obj-photos',
      status: 'Resolved',
      photos: [{ downloadUrl: 'https://example.com/before-obj.jpg' }],
      resolvedPhotos: [{ downloadUrl: 'https://example.com/after-obj.jpg' }],
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    const slider = container.querySelector('[data-testid="before-after-slider"]')
    expect(slider).not.toBeNull()
    const images = slider.querySelectorAll('img')
    expect(images[0].getAttribute('src')).toBe('https://example.com/after-obj.jpg')
    expect(images[1].getAttribute('src')).toBe('https://example.com/before-obj.jpg')
  })

  it('displays community endorsement celebration counter for multiple endorsements', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      endorsementCount: 8,
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    const card = container.querySelector('[data-testid="endorsement-counter-card"]')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('8')
    expect(card.textContent).toContain('neighbors backed')
  })

  it('displays singular neighbor backed when endorsementCount is 1', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      endorsedBy: ['citizen-1'],
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    const card = container.querySelector('[data-testid="endorsement-counter-card"]')
    expect(card.textContent).toContain('1')
    expect(card.textContent).toContain('neighbor backed')
  })

  it('displays community victory fallback when endorsement count is 0', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      endorsementCount: 0,
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    const card = container.querySelector('[data-testid="endorsement-counter-card"]')
    expect(card.textContent).toContain('Community Victory')
  })

  it('displays assigned worker name and department in field execution card', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      department: 'Sanitation',
      assignedWorker: {
        name: 'Rajesh Sharma',
        phone: '+91 9876543210',
      },
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    expect(container.textContent).toContain('Rajesh Sharma')
    expect(container.textContent).toContain('Sanitation')
  })

  it('falls back to municipal team when worker is not assigned', () => {
    const complaint = {
      id: 'issue-1',
      status: 'Resolved',
      department: 'Electricity',
      assignedWorker: null,
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    expect(container.textContent).toContain('Electricity Team')
  })

  it('allows citizen to click "Thank your Municipal Worker", shows appreciation and triggers callback', () => {
    const onThank = vi.fn()
    const complaint = {
      id: 'issue-42',
      status: 'Resolved',
      department: 'Roads',
      assignedWorker: { name: 'Vikram Singh' },
      workerThanksCount: 2,
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} onThankWorker={onThank} />)

    const thankBtn = container.querySelector('[data-testid="thank-worker-button"]')
    expect(thankBtn).not.toBeNull()
    expect(thankBtn.textContent).toContain('Thank your Municipal Worker')
    expect(container.querySelector('[data-testid="worker-thanks-count"]').textContent).toContain('2 thanks')

    act(() => {
      thankBtn.click()
    })

    expect(thankBtn.textContent).toContain('Appreciation Sent!')
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('Vikram Singh'),
      expect.any(Object)
    )
    expect(onThank).toHaveBeenCalledWith({
      complaintId: 'issue-42',
      workerName: 'Vikram Singh',
      department: 'Roads',
    })
    expect(localStorage.getItem('civic_thanked_issue-42')).toBe('true')
    expect(container.querySelector('[data-testid="worker-thanks-count"]').textContent).toContain('3 thanks')

    // Subsequent click shows info toast
    act(() => {
      thankBtn.click()
    })
    expect(toast).toHaveBeenCalledWith(
      'You have already thanked the worker for this resolution!',
      expect.any(Object)
    )
  })

  it('loads previously saved thank you state from localStorage', () => {
    localStorage.setItem('civic_thanked_issue-99', 'true')
    const complaint = {
      id: 'issue-99',
      status: 'Resolved',
      department: 'Water',
    }
    renderComponent(<MilestoneCelebrationBanner complaint={complaint} />)
    const thankBtn = container.querySelector('[data-testid="thank-worker-button"]')
    expect(thankBtn.textContent).toContain('Appreciation Sent!')
  })
})

describe('BeforeAfterComparisonSlider Component', () => {
  it('renders both before and after images with interactive slider', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage="https://example.com/before.jpg"
        afterImage="https://example.com/after.jpg"
      />
    )

    expect(container.querySelector('[data-testid="before-after-slider"]')).not.toBeNull()
    const slider = container.querySelector('[role="slider"]')
    expect(slider).not.toBeNull()
    expect(slider.getAttribute('aria-valuenow')).toBe('50')
    expect(container.textContent).toContain('Before (Reported)')
    expect(container.textContent).toContain('After (Resolved)')
  })

  it('adjusts slider position with keyboard navigation', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage="https://example.com/before.jpg"
        afterImage="https://example.com/after.jpg"
      />
    )

    const slider = container.querySelector('[role="slider"]')

    act(() => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('45')

    act(() => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('55')

    act(() => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('0')

    act(() => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    })
    expect(slider.getAttribute('aria-valuenow')).toBe('100')
  })

  it('updates slider position via range input change', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage="https://example.com/before.jpg"
        afterImage="https://example.com/after.jpg"
      />
    )

    const rangeInput = container.querySelector('input[type="range"]')
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeSetter.call(rangeInput, '75')
      rangeInput.dispatchEvent(new Event('input', { bubbles: true }))
      rangeInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const slider = container.querySelector('[role="slider"]')
    expect(slider.getAttribute('aria-valuenow')).toBe('75')
  })

  it('allows toggling between comparison slider and side-by-side cards view', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage="https://example.com/before.jpg"
        afterImage="https://example.com/after.jpg"
      />
    )

    const cardsToggle = container.querySelector('[data-testid="toggle-cards-view"]')
    const sliderToggle = container.querySelector('[data-testid="toggle-slider-view"]')
    expect(cardsToggle).not.toBeNull()
    expect(sliderToggle).not.toBeNull()

    // Initially in slider view
    expect(container.querySelector('[data-testid="before-after-slider"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="before-after-cards"]')).toBeNull()

    // Switch to side-by-side cards
    act(() => {
      cardsToggle.click()
    })
    expect(container.querySelector('[data-testid="before-after-cards"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="before-after-slider"]')).toBeNull()

    // Switch back to slider view
    act(() => {
      sliderToggle.click()
    })
    expect(container.querySelector('[data-testid="before-after-slider"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="before-after-cards"]')).toBeNull()
  })

  it('renders graceful fallback when only before image is available', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage="https://example.com/before.jpg"
        afterImage={null}
      />
    )

    expect(container.querySelector('[data-testid="before-only-fallback"]')).not.toBeNull()
    expect(container.textContent).toContain('Resolution verified and closed by municipal field crew')
  })

  it('renders graceful fallback when only after image is available', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage={null}
        afterImage="https://example.com/after.jpg"
      />
    )

    expect(container.querySelector('[data-testid="after-only-fallback"]')).not.toBeNull()
    expect(container.textContent).toContain('After (Resolved)')
  })

  it('renders graceful fallback when neither image is available', () => {
    renderComponent(
      <BeforeAfterComparisonSlider
        beforeImage={null}
        afterImage={null}
      />
    )

    expect(container.querySelector('[data-testid="no-photos-fallback"]')).not.toBeNull()
    expect(container.textContent).toContain('On-Site Resolution Verified')
  })
})

describe('ConfettiBurst Component', () => {
  it('renders a canvas element when active', () => {
    renderComponent(<ConfettiBurst active={true} />)
    const canvas = container.querySelector('[data-testid="confetti-canvas"]')
    expect(canvas).not.toBeNull()
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
  })

  it('does not render canvas when active is false', () => {
    renderComponent(<ConfettiBurst active={false} />)
    expect(container.querySelector('[data-testid="confetti-canvas"]')).toBeNull()
  })

  it('respects prefers-reduced-motion media query', () => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    const onComplete = vi.fn()
    renderComponent(<ConfettiBurst active={true} onComplete={onComplete} />)

    expect(container.querySelector('[data-testid="confetti-canvas"]')).toBeNull()
    expect(onComplete).toHaveBeenCalled()

    window.matchMedia = originalMatchMedia
  })
})
