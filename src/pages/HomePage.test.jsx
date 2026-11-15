import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const mockUseAuth = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer>Site Footer</footer>,
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function renderPage() {
  act(() => {
    root.render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    )
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  mockUseAuth.mockReturnValue({ user: null })
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  vi.clearAllMocks()
})

describe('HomePage editorial hero', () => {
  it('renders the editorial headline and introduction', () => {
    renderPage()

    expect(container.textContent).toContain('Better streets')
    expect(container.textContent).toContain('being heard.')
    expect(container.textContent).toContain('Your city. Your voice.')
  })

  it('renders both primary civic action buttons', () => {
    renderPage()

    expect(container.textContent).toContain(
      'Report a Problem in Your Street'
    )
    expect(container.textContent).toContain(
      'Track Existing Grievance'
    )
  })

  it('shows civic transparency metric labels', () => {
    renderPage()

    expect(container.textContent).toContain(
      'Issues resolved this week'
    )
    expect(container.textContent).toContain(
      'Average response time'
    )
    expect(container.textContent).toContain('Community impact')
  })

  it('shows sign-in navigation for signed-out visitors', () => {
    renderPage()

    const links = [...container.querySelectorAll('a')]

    expect(
      links.some(
        (link) =>
          link.textContent.includes('Report a Problem') &&
          link.getAttribute('href') === '/auth'
      )
    ).toBe(true)

    expect(
      links.some(
        (link) =>
          link.textContent.includes('Track Existing') &&
          link.getAttribute('href') === '/auth'
      )
    ).toBe(true)

    expect(container.textContent).toContain('Sign In')
  })

  it('shows report and grievance routes for signed-in citizens', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'citizen-1', role: 'citizen' },
    })

    renderPage()

    const links = [...container.querySelectorAll('a')]

    expect(
      links.some(
        (link) =>
          link.textContent.includes('Report a Problem') &&
          link.getAttribute('href') === '/report'
      )
    ).toBe(true)

    expect(
      links.some(
        (link) =>
          link.textContent.includes('Track Existing') &&
          link.getAttribute('href') === '/my-reports'
      )
    ).toBe(true)
  })

  it('preserves the How It Works section and footer', () => {
    renderPage()

    expect(container.querySelector('#how-it-works')).not.toBeNull()
    expect(container.textContent).toContain('Site Footer')
  })
})