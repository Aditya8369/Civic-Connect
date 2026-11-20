// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AITriageCard } from './AITriageCard'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('AITriageCard', () => {
  let container
  let root

  beforeEach(() => {
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

  it('renders nothing when triageResult is null and analyzing is false', () => {
    act(() => {
      root.render(<AITriageCard triageResult={null} analyzing={false} />)
    })
    expect(container.querySelector('[data-testid="ai-triage-card"]')).toBeNull()
    expect(container.querySelector('[data-testid="ai-triage-loading"]')).toBeNull()
  })

  it('renders loading state when analyzing is true', () => {
    act(() => {
      root.render(<AITriageCard triageResult={null} analyzing={true} />)
    })
    const loading = container.querySelector('[data-testid="ai-triage-loading"]')
    expect(loading).not.toBeNull()
    expect(loading.textContent).toContain('AI Multimodal Vision Triage Active')
  })

  it('renders triage suggestions with category, confidence, and severity', () => {
    const mockTriage = {
      category: 'Potholes & Road Damage',
      department: 'Roads',
      confidence: 0.94,
      severity: 'High',
      severityReason: 'Large deep crater posing active vehicular hazard',
      suggestedTitle: 'Dangerous pothole on roadway',
      suggestedDescription: 'A severe crater on the asphalt requiring immediate patch work.',
      source: 'gemini',
    }

    act(() => {
      root.render(<AITriageCard triageResult={mockTriage} />)
    })

    const card = container.querySelector('[data-testid="ai-triage-card"]')
    expect(card).not.toBeNull()
    expect(card.textContent).toContain('Potholes & Road Damage')
    expect(card.textContent).toContain('Roads')
    expect(card.textContent).toContain('94% confidence')
    expect(card.textContent).toContain('High')
    expect(card.textContent).toContain('Large deep crater posing active vehicular hazard')
    expect(card.textContent).toContain('Dangerous pothole on roadway')
    expect(card.textContent).toContain('A severe crater on the asphalt')
    expect(card.textContent).toContain('Gemini 1.5 Flash')
  })

  it('triggers onAccept when Accept All Suggestions is clicked', () => {
    const onAccept = vi.fn()
    const mockTriage = {
      category: 'Water Leakage',
      department: 'Water',
      confidence: 0.88,
      severity: 'Medium',
      suggestedTitle: 'Burst waterline',
      suggestedDescription: 'Continuous water flow across pavement',
    }

    act(() => {
      root.render(<AITriageCard triageResult={mockTriage} onAccept={onAccept} />)
    })

    const acceptBtn = container.querySelector('[data-testid="triage-accept-btn"]')
    expect(acceptBtn).not.toBeNull()
    act(() => {
      acceptBtn.click()
    })
    expect(onAccept).toHaveBeenCalledTimes(1)
  })

  it('triggers individual apply buttons for category, title, and description', () => {
    const onApplyCategory = vi.fn()
    const onApplyTitle = vi.fn()
    const onApplyDescription = vi.fn()

    const mockTriage = {
      category: 'Streetlight Issues',
      department: 'Electricity',
      confidence: 0.82,
      severity: 'Low',
      suggestedTitle: 'Flickering street lamp',
      suggestedDescription: 'Pole #4 lamp is unlit at night',
    }

    act(() => {
      root.render(
        <AITriageCard
          triageResult={mockTriage}
          onApplyCategory={onApplyCategory}
          onApplyTitle={onApplyTitle}
          onApplyDescription={onApplyDescription}
        />
      )
    })

    const catBtn = container.querySelector('[data-testid="triage-apply-category-btn"]')
    const titleBtn = container.querySelector('[data-testid="triage-apply-title-btn"]')
    const descBtn = container.querySelector('[data-testid="triage-apply-desc-btn"]')

    expect(catBtn).not.toBeNull()
    expect(titleBtn).not.toBeNull()
    expect(descBtn).not.toBeNull()

    act(() => {
      catBtn.click()
    })
    expect(onApplyCategory).toHaveBeenCalledTimes(1)

    act(() => {
      titleBtn.click()
    })
    expect(onApplyTitle).toHaveBeenCalledTimes(1)

    act(() => {
      descBtn.click()
    })
    expect(onApplyDescription).toHaveBeenCalledTimes(1)
  })

  it('triggers onDismiss when dismiss close button is clicked', () => {
    const onDismiss = vi.fn()
    const mockTriage = {
      category: 'Garbage & Sanitation',
      department: 'Sanitation',
      confidence: 0.78,
      severity: 'Medium',
    }

    act(() => {
      root.render(<AITriageCard triageResult={mockTriage} onDismiss={onDismiss} />)
    })

    const dismissBtn = container.querySelector('button[aria-label="Dismiss AI suggestion"]')
    expect(dismissBtn).not.toBeNull()
    act(() => {
      dismissBtn.click()
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders auto-populated notice when autoPopulated is true', () => {
    const mockTriage = {
      category: 'Traffic Issues',
      department: 'Public Safety',
      confidence: 0.9,
      severity: 'Urgent',
    }

    act(() => {
      root.render(<AITriageCard triageResult={mockTriage} autoPopulated={true} />)
    })

    const notice = container.querySelector('[data-testid="ai-auto-populated-notice"]')
    expect(notice).not.toBeNull()
    expect(notice.textContent).toContain('pre-filled from photo')
  })

  it('disables buttons when disabled prop is true', () => {
    const onAccept = vi.fn()
    const mockTriage = {
      category: 'Roads',
      department: 'Roads',
      confidence: 0.8,
      severity: 'Medium',
      suggestedTitle: 'Road damage',
      suggestedDescription: 'Desc',
    }

    act(() => {
      root.render(<AITriageCard triageResult={mockTriage} onAccept={onAccept} disabled={true} />)
    })

    const acceptBtn = container.querySelector('[data-testid="triage-accept-btn"]')
    expect(acceptBtn.disabled).toBe(true)
  })
})
