import { describe, it, expect } from 'vitest'
import { PageSkeleton } from './PageSkeleton'

describe('PageSkeleton', () => {
  it('renders with accessibility attributes for loading state', () => {
    const element = PageSkeleton()
    expect(element.props.role).toBe('status')
    expect(element.props['aria-label']).toBe('Loading page content')
  })

  it('contains sr-only text for screen readers', () => {
    const element = PageSkeleton()
    const children = element.props.children
    const srOnly = children.find(child => child?.props?.className?.includes('sr-only'))
    expect(srOnly).toBeDefined()
    expect(srOnly.props.children).toBe('Loading page...')
  })
})

