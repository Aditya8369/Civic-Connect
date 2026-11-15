// @vitest-environment jsdom


globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { CitizenOnboarding } from './CitizenOnboarding'

const authState = {
  user: { uid: 'citizen-1', role: 'citizen', name: 'Jane Citizen' },
  loading: false,
}

const mockNavigate = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}))

let container = null
let root = null

async function renderOnboarding(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root.render(
      <LanguageProvider>
        <CitizenOnboarding {...props} />
      </LanguageProvider>
    )
  })
}

function cleanupComponent() {
  if (root) {
    act(() => {
      root.unmount()
    })
    root = null
  }

  if (container?.parentNode) {
    container.parentNode.removeChild(container)
    container = null
  }
}

describe('CitizenOnboarding Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('civic-connect-language', 'en')

    authState.user = {
      uid: 'citizen-1',
      role: 'citizen',
      name: 'Jane Citizen',
    }
    authState.loading = false
  })

  afterEach(() => {
    cleanupComponent()
  })

  it('renders onboarding guide for eligible first-time citizens', async () => {
    await renderOnboarding()

    expect(container.textContent).toContain('Step 1 of 3')
    expect(container.textContent).toContain('Report an Issue')
    expect(container.textContent).toContain(
      'Spot a civic problem in your neighborhood?'
    )
    expect(container.querySelector('button')).not.toBeNull()
  })

  it('does NOT render for administrators', async () => {
    authState.user = {
      uid: 'admin-1',
      role: 'admin',
      name: 'Admin Officer',
    }

    await renderOnboarding()

    expect(container.innerHTML).toBe('')
  })

  it('does NOT render while authentication is loading', async () => {
    authState.loading = true

    await renderOnboarding()

    expect(container.innerHTML).toBe('')
  })

  it('does NOT render when user is null (logged out)', async () => {
    authState.user = null

    await renderOnboarding()

    expect(container.innerHTML).toBe('')
  })

  it('does NOT render if previously completed or dismissed in localStorage', async () => {
    localStorage.setItem(
      'civic_onboarding_completed_citizen-1',
      'true'
    )

    await renderOnboarding()

    expect(container.innerHTML).toBe('')
  })

  it('renders when forceShow is true even if stored as completed', async () => {
    localStorage.setItem(
      'civic_onboarding_completed_citizen-1',
      'true'
    )

    await renderOnboarding({ forceShow: true })

    expect(container.textContent).toContain('Report an Issue')
  })

  it('navigates through all 3 steps with Next and Previous buttons', async () => {
    await renderOnboarding()

    // Step 1
    expect(container.textContent).toContain('Report an Issue')
    expect(container.textContent).toContain('Step 1 of 3')
    expect(container.textContent).not.toContain('Previous')

    // Click Next to go to Step 2
    const nextBtn = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.includes('Next'))

    await act(async () => {
      nextBtn.click()
    })

    // Step 2
    expect(container.textContent).toContain('Track Your Reports')
    expect(container.textContent).toContain('Step 2 of 3')
    expect(container.textContent).toContain('Previous')

    // Click Previous to go back to Step 1
    const prevBtn = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.includes('Previous'))

    await act(async () => {
      prevBtn.click()
    })

    // Back on Step 1
    expect(container.textContent).toContain('Report an Issue')
    expect(container.textContent).toContain('Step 1 of 3')

    // Click Next twice to go to Step 3
    const nextBtnAgain = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.includes('Next'))

    await act(async () => {
      nextBtnAgain.click()
    })

    const nextBtnStep2 = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.includes('Next'))

    await act(async () => {
      nextBtnStep2.click()
    })

    // Step 3
    expect(container.textContent).toContain('Stay Connected')
    expect(container.textContent).toContain('Step 3 of 3')
    expect(container.textContent).toContain('Get Started')
  })

  it('supports direct step selection via indicator dots', async () => {
    await renderOnboarding()

    const step3Dot = container.querySelector(
      'button[aria-label="Go to step 3"]'
    )

    expect(step3Dot).not.toBeNull()

    await act(async () => {
      step3Dot.click()
    })

    expect(container.textContent).toContain('Stay Connected')
    expect(container.textContent).toContain('Step 3 of 3')
  })

  it('persists completion and calls onComplete when clicking Get Started on final step', async () => {
    const onComplete = vi.fn()

    await renderOnboarding({ onComplete })

    // Jump to step 3
    const step3Dot = container.querySelector(
      'button[aria-label="Go to step 3"]'
    )

    await act(async () => {
      step3Dot.click()
    })

    const getStartedBtn = Array.from(
      container.querySelectorAll('button')
    ).find((button) =>
      button.textContent.includes('Get Started')
    )

    await act(async () => {
      getStartedBtn.click()
    })

    expect(
      localStorage.getItem('civic_onboarding_completed_citizen-1')
    ).toBe('true')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('persists dismissal and calls onDismiss when clicking Skip', async () => {
    const onDismiss = vi.fn()

    await renderOnboarding({ onDismiss })

    const skipBtn = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.trim() === 'Skip')

    expect(skipBtn).toBeDefined()

    await act(async () => {
      skipBtn.click()
    })

    expect(
      localStorage.getItem('civic_onboarding_completed_citizen-1')
    ).toBe('true')
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })

  it('dismisses onboarding when clicking the X close button', async () => {
    await renderOnboarding()

    const closeBtn = container.querySelector(
      'button[aria-label="Dismiss onboarding"]'
    )

    expect(closeBtn).not.toBeNull()

    await act(async () => {
      closeBtn.click()
    })

    expect(
      localStorage.getItem('civic_onboarding_completed_citizen-1')
    ).toBe('true')
    expect(container.innerHTML).toBe('')
  })

  it('clicking step action link marks onboarding completed and navigates', async () => {
    await renderOnboarding()

    const actionLink = Array.from(
      container.querySelectorAll('button')
    ).find((button) =>
      button.textContent.includes('Report an Issue →')
    )

    expect(actionLink).toBeDefined()

    await act(async () => {
      actionLink.click()
    })

    expect(
      localStorage.getItem('civic_onboarding_completed_citizen-1')
    ).toBe('true')
    expect(mockNavigate).toHaveBeenCalledWith('/report')
    expect(container.innerHTML).toBe('')
  })

  it('maintains independent onboarding state for different authenticated users', async () => {
    // User 1 completes onboarding
    localStorage.setItem(
      'civic_onboarding_completed_user-1',
      'true'
    )

    // Switch to User 2 (first-time citizen)
    authState.user = {
      uid: 'user-2',
      role: 'citizen',
      name: 'User Two',
    }

    await renderOnboarding()

    // User 2 should see onboarding
    expect(container.textContent).toContain('Report an Issue')
    expect(
      localStorage.getItem('civic_onboarding_completed_user-2')
    ).toBeNull()

    // User 2 skips
    const skipBtn = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.trim() === 'Skip')

    await act(async () => {
      skipBtn.click()
    })

    expect(
      localStorage.getItem('civic_onboarding_completed_user-2')
    ).toBe('true')
    expect(
      localStorage.getItem('civic_onboarding_completed_user-1')
    ).toBe('true')
  })
})
