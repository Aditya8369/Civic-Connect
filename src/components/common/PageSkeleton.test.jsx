
import { beforeEach, describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { PageSkeleton } from './PageSkeleton'

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function renderPageSkeleton() {
  return renderToStaticMarkup(
    <LanguageProvider>
      <PageSkeleton />
    </LanguageProvider>
  )
}

describe('PageSkeleton', () => {
  it('renders with accessibility attributes for loading state', () => {
    const html = renderPageSkeleton()

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-label="Loading page content"')
  })

  it('contains sr-only text for screen readers', () => {
    const html = renderPageSkeleton()

    expect(html).toContain('sr-only')
    expect(html).toContain('Loading page...')
  })
})

