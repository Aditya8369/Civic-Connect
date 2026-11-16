// @vitest-environment jsdom

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartmentCsatWidget } from './DepartmentCsatWidget'
import { LanguageProvider } from '@/contexts/LanguageContext'

let container = null
let root = null

function renderWidget(props = {}) {
  act(() => {
    root.render(
      <LanguageProvider>
        <DepartmentCsatWidget {...props} />
      </LanguageProvider>
    )
  })
}

describe('DepartmentCsatWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem('civic-connect-language', 'en')
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
    document.body.innerHTML = ''
  })

  it('renders the empty state when complaints array is empty or has no ratings', () => {
    renderWidget({ complaints: [] })

    expect(container.textContent).toContain('Citizen Satisfaction (CSAT) & Sentiment')
    expect(container.textContent).toContain('No Citizen Feedback Yet')
    expect(container.textContent).toContain(
      'Satisfaction scores and sentiment ratios will appear here as citizens rate resolved grievances.'
    )
  })

  it('renders CSAT metrics, average rating, and total reviews when feedback exists', () => {
    const complaints = [
      {
        id: 'c1',
        title: 'Road crack',
        department: 'Roads',
        feedback: {
          rating: 5,
          comment: 'Quick and clean fix!',
          submittedAt: new Date('2026-03-01T10:00:00Z'),
        },
      },
      {
        id: 'c2',
        title: 'Water valve leak',
        department: 'Water',
        feedback: {
          rating: 4,
          comment: 'Fixed on time.',
          submittedAt: new Date('2026-03-02T10:00:00Z'),
        },
      },
      {
        id: 'c3',
        title: 'Flickering light',
        department: 'Electricity',
        feedback: {
          rating: 2,
          comment: 'Took too long to arrive.',
          submittedAt: new Date('2026-03-03T10:00:00Z'),
        },
      },
    ]

    renderWidget({ complaints })

    // 2 out of 3 ratings are positive (4, 5) -> CSAT is 67%
    expect(container.textContent).toContain('67%')
    expect(container.textContent).toContain('Net CSAT Score')
    expect(container.textContent).toContain('Citizen Reviews')
    expect(container.textContent).toContain('Average Rating')

    // Sentiment distribution bar
    const progressbar = container.querySelector('[role="progressbar"]')
    expect(progressbar).not.toBeNull()
    expect(progressbar.getAttribute('aria-valuenow')).toBe('67')
  })

  it('displays department cards with individual CSAT scores', () => {
    const complaints = [
      {
        id: 'r1',
        title: 'Road repair',
        department: 'Roads',
        feedback: { rating: 5, comment: 'Great!' },
      },
      {
        id: 'r2',
        title: 'Pothole patch',
        department: 'Roads',
        feedback: { rating: 4, comment: 'Good' },
      },
      {
        id: 'w1',
        title: 'Pipe break',
        department: 'Water',
        feedback: { rating: 1, comment: 'Terrible' },
      },
    ]

    renderWidget({ complaints })

    // Roads has 100% CSAT (2 out of 2 positive)
    expect(container.textContent).toContain('100% CSAT')
    // Water has 0% CSAT (1 out of 1 negative)
    expect(container.textContent).toContain('0% CSAT')
  })

  it('calls onSelectDepartment callback when clicking filter button', () => {
    const onSelectDepartment = vi.fn()
    const complaints = [
      {
        id: 'r1',
        title: 'Pothole fix',
        department: 'Roads',
        feedback: { rating: 5, comment: 'Prompt fix' },
      },
    ]

    renderWidget({ complaints, onSelectDepartment })

    const filterButton = container.querySelector('button[aria-label="Filter reports by Roads & Bridges"]') ||
      Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Filter by Dept'))

    expect(filterButton).not.toBeNull()
    act(() => {
      filterButton.click()
    })

    expect(onSelectDepartment).toHaveBeenCalledWith('Roads')
  })

  it('toggles recent citizen comments when clicking view/hide comments', () => {
    const complaints = [
      {
        id: 'c1',
        title: 'Pothole fix',
        department: 'Roads',
        feedback: {
          rating: 5,
          comment: 'Exceptional service by municipal crew.',
          submittedAt: new Date('2026-03-01T10:00:00Z'),
        },
      },
    ]

    renderWidget({ complaints })

    expect(container.textContent).toContain('Recent Citizen Comments')
    // Comments section initially collapsed
    expect(container.textContent).not.toContain('Exceptional service by municipal crew.')

    const toggleButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent.includes('View Comments')
    )
    expect(toggleButton).not.toBeNull()

    act(() => {
      toggleButton.click()
    })

    // Now comment is visible
    expect(container.textContent).toContain('Exceptional service by municipal crew.')
    expect(toggleButton.textContent).toContain('Hide Comments')

    // Clicking again hides the comments
    act(() => {
      toggleButton.click()
    })
    expect(container.textContent).not.toContain('Exceptional service by municipal crew.')
  })
})
