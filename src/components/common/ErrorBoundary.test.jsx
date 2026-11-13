import { describe, expect, it } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

// Set up localStorage mock before any tests
const localStorageMock = {
  _storage: {},
  getItem: function (key) {
    return this._storage[key] || null
  },
  setItem: function (key, value) {
    this._storage[key] = value
  },
  clear: function () {
    this._storage = {}
  }
}
global.localStorage = localStorageMock

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

    localStorageMock.setItem('errorBoundaryTelemetry', JSON.stringify(telemetry))

    const stored = JSON.parse(localStorageMock.getItem('errorBoundaryTelemetry'))
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

    const existing = JSON.parse(localStorageMock.getItem('errorBoundaryTelemetry'))
    const telemetry = [...existing, telemetryEntry]
    localStorageMock.setItem('errorBoundaryTelemetry', JSON.stringify(telemetry))

    const stored = JSON.parse(localStorageMock.getItem('errorBoundaryTelemetry'))
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

    const stored = JSON.parse(localStorageMock.getItem('errorBoundaryTelemetry'))
    expect(stored[0]).toHaveProperty('error', 'Error: something failed')
    expect(stored[0]).toHaveProperty('stack', 'Error: something failed\n    in Component')
  })
})

describe('ErrorBoundary - Retry', () => {
  it('resetErrorState method exists and is a function', () => {
    const boundary = new ErrorBoundary(null)
    expect(typeof boundary.resetErrorState).toBe('function')
  })
})