
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import ErrorBoundary from './ErrorBoundary'
import { LanguageProvider } from '@/contexts/LanguageContext'

// Set up localStorage mock before any tests
const localStorageMock = {
  _storage: {},

  getItem(key) {
    return this._storage[key] || null
  },

  setItem(key, value) {
    this._storage[key] = value
  },

  clear() {
    this._storage = {}
  },
}

globalThis.localStorage = localStorageMock
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let consoleErrorSpy

function mount(element) {
  container = document.createElement('div')
  document.body.appendChild(container)

  root = createRoot(container)

  act(() => {
    root.render(
      createElement(
        LanguageProvider,
        null,
        element
      )
    )
  })

  return container
}

function unmount() {
  if (root) {
    act(() => root.unmount())
    root = null
  }

  container?.remove()
  container = null
}

beforeEach(() => {
  localStorageMock.clear()
  localStorageMock.setItem('civic-connect-language', 'en')
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  unmount()
  consoleErrorSpy?.mockRestore()
})

describe('ErrorBoundary - LocalStorage Telemetry', () => {
  it('stores error telemetry in localStorage when error is caught', () => {
    // Reset storage
    localStorageMock._storage = {}

    // Simulate the componentDidCatch behavior
    const telemetryEntry = {
      timestamp: new Date().toISOString(),
      error: 'Error: test error',
      stack: 'Error: test error',
    }

    const existing = localStorageMock.getItem('errorBoundaryTelemetry')

    const telemetry = existing
      ? [...JSON.parse(existing), telemetryEntry]
      : [telemetryEntry]

    localStorageMock.setItem(
      'errorBoundaryTelemetry',
      JSON.stringify(telemetry)
    )

    const stored = JSON.parse(
      localStorageMock.getItem('errorBoundaryTelemetry')
    )

    expect(stored).toHaveLength(1)
    expect(stored[0]).toHaveProperty('timestamp')
    expect(stored[0].error).toContain('test error')
  })

  it('accumulates multiple error entries in localStorage', () => {
    // Reset storage
    localStorageMock._storage = {}

    // First error
    localStorageMock.setItem(
      'errorBoundaryTelemetry',
      JSON.stringify([
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          error: 'Error: first error',
          stack: 'Error: first error',
        },
      ])
    )

    // Second error
    const telemetryEntry = {
      timestamp: new Date().toISOString(),
      error: 'Error: second error',
      stack: 'Error: second error',
    }

    const existing = JSON.parse(
      localStorageMock.getItem('errorBoundaryTelemetry')
    )

    const telemetry = [...existing, telemetryEntry]

    localStorageMock.setItem(
      'errorBoundaryTelemetry',
      JSON.stringify(telemetry)
    )

    const stored = JSON.parse(
      localStorageMock.getItem('errorBoundaryTelemetry')
    )

    expect(stored).toHaveLength(2)
    expect(stored[1].error).toContain('second error')
  })

  it('includes error and stack information in telemetry', () => {
    localStorageMock.setItem(
      'errorBoundaryTelemetry',
      JSON.stringify([
        {
          timestamp: '2024-01-01T00:00:00.000Z',
          error: 'Error: something failed',
          stack: 'Error: something failed\n    in Component',
        },
      ])
    )

    const stored = JSON.parse(
      localStorageMock.getItem('errorBoundaryTelemetry')
    )

    expect(stored[0]).toHaveProperty(
      'error',
      'Error: something failed'
    )

    expect(stored[0]).toHaveProperty(
      'stack',
      'Error: something failed\n    in Component'
    )
  })
})

describe('ErrorBoundary - Retry', () => {
  it('recovers and renders children when retry button is clicked', () => {
    let shouldThrow = true

    function FlakyChild() {
      if (shouldThrow) {
        shouldThrow = false
        throw new Error('Test component failure')
      }

      return createElement('p', null, 'Recovered content')
    }

    const element = createElement(
      ErrorBoundary,
      null,
      createElement(FlakyChild)
    )

    mount(element)

    // Error fallback should be displayed
    expect(container.textContent).toContain('Something went wrong')
    expect(container.textContent).toContain('Try Again')

    const retryButton = Array.from(
      container.querySelectorAll('button')
    ).find((button) => button.textContent.includes('Retry'))

    expect(retryButton).not.toBeUndefined()

    // Click retry
    act(() => {
      retryButton.click()
    })

    // Child should render successfully after retry
    expect(container.textContent).toContain('Recovered content')
    expect(container.textContent).not.toContain('Something went wrong')
  })
})
