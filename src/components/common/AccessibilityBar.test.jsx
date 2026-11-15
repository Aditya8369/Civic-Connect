

import { beforeEach, describe, expect, it, afterEach } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  cleanup,
} from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { LanguageProvider } from '@/contexts/LanguageContext'
import AccessibilityBar from './AccessibilityBar'

function renderAccessibilityBar() {
  return render(
    <LanguageProvider>
      <AccessibilityBar />
    </LanguageProvider>
  )
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('civic-connect-language', 'en')

  document.documentElement.classList.remove('high-contrast')
  document.documentElement.style.removeProperty('--accessibility-font-size')
})

describe('AccessibilityBar', () => {
  it('renders all accessibility controls', () => {
    renderAccessibilityBar()

    expect(
      screen.getByRole('button', { name: 'Decrease text size' })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Reset text size' })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Increase text size' })
    ).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'Toggle high contrast mode' })
    ).toBeInTheDocument()
  })

  it('increases font size', () => {
    renderAccessibilityBar()

    fireEvent.click(
      screen.getByRole('button', { name: 'Increase text size' })
    )

    expect(
      document.documentElement.style.getPropertyValue(
        '--accessibility-font-size'
      )
    ).toBe('18px')
  })

  it('decreases font size', () => {
    renderAccessibilityBar()

    fireEvent.click(
      screen.getByRole('button', { name: 'Decrease text size' })
    )

    expect(
      document.documentElement.style.getPropertyValue(
        '--accessibility-font-size'
      )
    ).toBe('14px')
  })

  it('resets font size', () => {
    renderAccessibilityBar()

    fireEvent.click(
      screen.getByRole('button', { name: 'Increase text size' })
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Reset text size' })
    )

    expect(
      document.documentElement.style.getPropertyValue(
        '--accessibility-font-size'
      )
    ).toBe('16px')
  })

  it('toggles high contrast mode', () => {
    renderAccessibilityBar()

    const button = screen.getByRole('button', {
      name: 'Toggle high contrast mode',
    })

    fireEvent.click(button)

    expect(document.documentElement).toHaveClass('high-contrast')
    expect(button).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(button)

    expect(document.documentElement).not.toHaveClass('high-contrast')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('restores saved accessibility preferences', () => {
    localStorage.setItem('civic-font-size', '20')
    localStorage.setItem('civic-high-contrast', 'true')

    renderAccessibilityBar()

    expect(
      document.documentElement.style.getPropertyValue(
        '--accessibility-font-size'
      )
    ).toBe('20px')

    expect(document.documentElement).toHaveClass('high-contrast')
  })

  it('disables font controls at their limits', () => {
    localStorage.setItem('civic-font-size', '22')

    renderAccessibilityBar()

    expect(
      screen.getByRole('button', { name: 'Increase text size' })
    ).toBeDisabled()
  })
})
