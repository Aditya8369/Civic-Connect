
import React, { Component } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

class ErrorBoundaryClass extends Component {
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
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, errorInfo) {
    const telemetryEntry = {
      timestamp: new Date().toISOString(),
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo ? errorInfo.componentStack : null,
    }

    const existing =
      typeof window !== 'undefined'
        ? localStorage.getItem('errorBoundaryTelemetry')
        : null

    const telemetry = existing
      ? [...JSON.parse(existing), telemetryEntry]
      : [telemetryEntry]

    localStorage.setItem(
      'errorBoundaryTelemetry',
      JSON.stringify(telemetry)
    )

    if (process.env.NODE_ENV !== 'production') {
      console.error('Error caught by ErrorBoundary:', error, errorInfo)
    }
  }

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
    const { t } = this.props

    const telemetry =
      typeof window !== 'undefined'
        ? JSON.parse(
            localStorage.getItem('errorBoundaryTelemetry') || '[]'
          )
        : []

    return (
      <div
        role="alert"
        aria-live="polite"
        aria-label={t('errorStateRecovered')}
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
        <h2
          style={{
            margin: '0 0 1rem',
            fontSize: '1.25rem',
            fontWeight: '600',
          }}
        >
          {t('somethingWentWrong')}
        </h2>

        <p
          style={{
            margin: '0 0 1.5rem',
            fontSize: '0.95rem',
            color: 'var(--muted, #66666b)',
          }}
        >
          {t('unexpectedErrorDescription')}
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
          aria-label={t('retryRecoverError')}
        >
          {t('retry')}
        </button>

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
                {t('viewDiagnosticTelemetry').replace(
                  '{count}',
                  String(telemetry.length)
                )}
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

export function ErrorBoundary(props) {
  const { t } = useLanguage()

  return <ErrorBoundaryClass {...props} t={t} />
}

export default ErrorBoundary
