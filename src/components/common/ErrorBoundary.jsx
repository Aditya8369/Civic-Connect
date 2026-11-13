import React, { Component } from 'react'

/**
 * ErrorBoundary - Catches runtime crashes in descendant components,
 * displays an accessible fallback screen, and logs diagnostic telemetry
 * to localStorage for export.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
    this.telemetry = []
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    // Log the error and error info to localStorage telemetry
    const telemetryEntry = {
      timestamp: new Date().toISOString(),
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo ? errorInfo.componentStack : null,
    }

    // Store telemetry in localStorage (array, append new entries)
    const existing = typeof window !== 'undefined' ? localStorage.getItem('errorBoundaryTelemetry') : null
    const telemetry = existing ? [...JSON.parse(existing), telemetryEntry] : [telemetryEntry]
    localStorage.setItem('errorBoundaryTelemetry', JSON.stringify(telemetry))

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error caught by ErrorBoundary:', error, errorInfo)
    }
  }

  // Clear the caught error state when retry is attempted
  resetErrorState = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallback()
    }
    return this.props.children
  }

  renderFallback() {
    const telemetry = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('errorBoundaryTelemetry') || '[]') : []

    return (
      <div
        role="alert"
        aria-live="polite"
        aria-label="Error state - application recovered"
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--foreground, #18181b)',
          background: 'var(--card, #ffffff)',
          border: '1px solid var(--border, #e5e5e6)',
          borderRadius: '8px',
          maxWidth: '600px',
          margin: '2rem auto',
        }}
      >
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: '600' }}>
          Something went wrong
        </h2>

        <p style={{ margin: '0 0 1.5rem', fontSize: '0.95rem', color: 'var(--muted, #66666b)' }}>
          An unexpected error occurred. The application has recovered and saved diagnostic information.
        </p>

        <button
          onClick={this.resetErrorState}
          style={{
            margin: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '0.95rem',
            fontFamily: 'inherit',
            cursor: 'pointer',
            background: 'var(--primary, #3b82f6)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            transition: 'background 0.2s',
          }}
          aria-label="Retry and recover from error"
        >
          Retry
        </button>

        {/* Telemetry export section - for diagnostics */}
        {telemetry.length > 0 && (
          <div
            style={{
              margin: '1.5rem 0 0',
              padding: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--muted, #66666b)',
              background: 'var(--card, #ffffff)',
              border: '1px solid var(--muted, #e5e5e6)',
              borderRadius: '4px',
            }}
          >
            <details>
              <summary>
                View diagnostic telemetry ({telemetry.length} error(s))
              </summary>
              <pre
                style={{
                  margin: '0.5rem 0 0',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                {JSON.stringify(telemetry, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    )
  }
}

export default ErrorBoundary