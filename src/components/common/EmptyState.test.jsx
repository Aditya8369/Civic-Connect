
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { EmptyState } from './EmptyState'

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function renderWithLanguage(component) {
  return renderToStaticMarkup(
    <LanguageProvider>
      {component}
    </LanguageProvider>
  )
}

describe('EmptyState Component', () => {
  it('renders heading and description correctly', () => {
    const html = renderWithLanguage(
      <EmptyState
        heading="No Reports Yet"
        description="You haven't submitted any civic reports yet. Help improve your community by reporting an issue."
      />
    )

    expect(html).toContain('No Reports Yet')
    expect(html).toContain(
      "You haven&#x27;t submitted any civic reports yet. Help improve your community by reporting an issue."
    )
  })

  it('supports title as an alias for heading', () => {
    const html = renderWithLanguage(
      <EmptyState
        title="Alternate Title"
        description="Some description"
      />
    )

    expect(html).toContain('Alternate Title')
  })

  it('renders reports variant SVG illustration', () => {
    const html = renderWithLanguage(
      <EmptyState
        variant="reports"
        heading="No Reports Yet"
        description="Report an issue to help your community."
      />
    )

    expect(html).toContain('<svg')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('No Reports Yet')
  })

  it('renders notifications variant SVG illustration', () => {
    const html = renderWithLanguage(
      <EmptyState
        variant="notifications"
        heading="You're All Caught Up!"
        description="You don't have any notifications right now."
      />
    )

    expect(html).toContain('<svg')
    expect(html).toContain("You&#x27;re All Caught Up!")
    expect(html).toContain('aria-hidden="true"')
  })

  it('renders community variant SVG illustration', () => {
    const html = renderWithLanguage(
      <EmptyState
        variant="community"
        heading="No Community Posts Yet"
        description="There are no posts to display right now."
      />
    )

    expect(html).toContain('<svg')
    expect(html).toContain('No Community Posts Yet')
    expect(html).toContain('aria-hidden="true"')
  })

  it('renders default variant when no variant is specified', () => {
    const html = renderWithLanguage(
      <EmptyState heading="Default Empty" />
    )

    expect(html).toContain('<svg')
    expect(html).toContain('Default Empty')
  })

  it('renders custom illustration when provided', () => {
    const customSvg = (
      <span data-testid="custom-vector">Custom Art</span>
    )

    const html = renderWithLanguage(
      <EmptyState
        illustration={customSvg}
        heading="Custom Art Empty"
      />
    )

    expect(html).toContain('data-testid="custom-vector"')
    expect(html).toContain('Custom Art')
  })

  it('renders action button with actionLabel and onAction', () => {
    const onAction = vi.fn()

    const html = renderWithLanguage(
      <EmptyState
        heading="No Reports Yet"
        actionLabel="Report an Issue"
        onAction={onAction}
      />
    )

    expect(html).toContain('Report an Issue')
    expect(html).toContain('<button')
  })

  it('supports actionText alias for actionLabel', () => {
    const html = renderWithLanguage(
      <EmptyState
        heading="No Community Posts Yet"
        actionText="Create a Post"
        onAction={() => {}}
      />
    )

    expect(html).toContain('Create a Post')
  })

  it('renders custom action element when passed via action prop', () => {
    const customButton = (
      <a href="/report" className="custom-link">
        Submit Feedback
      </a>
    )

    const html = renderWithLanguage(
      <EmptyState
        heading="Need Help"
        action={customButton}
      />
    )

    expect(html).toContain('href="/report"')
    expect(html).toContain('custom-link')
    expect(html).toContain('Submit Feedback')
  })

  it('does not render button when onAction or actionLabel is missing', () => {
    const html = renderWithLanguage(
      <EmptyState
        heading="You're All Caught Up!"
        description="We'll let you know when there are updates."
      />
    )

    expect(html).not.toContain('<button')
  })

  it('includes accessible region role and aria-label', () => {
    const html = renderWithLanguage(
      <EmptyState
        heading="Accessible Empty Heading"
      />
    )

    expect(html).toContain('role="region"')
    expect(html).toContain(
      'aria-label="Accessible Empty Heading"'
    )
  })
})
