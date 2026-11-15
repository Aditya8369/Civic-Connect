
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '@/contexts/ThemeContext'
import { LanguageProvider } from '@/contexts/LanguageContext'

vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: vi.fn(),
}))

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function render(theme) {
  useTheme.mockReturnValue({
    theme,
    toggleTheme: vi.fn(),
  })

  return renderToStaticMarkup(
    <LanguageProvider>
      <ThemeToggle />
    </LanguageProvider>
  )
}

describe('ThemeToggle', () => {
  it('offers to switch to dark mode while the theme is light', () => {
    const html = render('light')

    expect(html).toContain('aria-label="Switch to dark mode"')
    expect(html).toContain('title="Switch to dark mode"')
  })

  it('offers to switch to light mode while the theme is dark', () => {
    const html = render('dark')

    expect(html).toContain('aria-label="Switch to light mode"')
    expect(html).toContain('title="Switch to light mode"')
  })

  it('is a real button that cannot submit a form', () => {
    expect(render('light')).toMatch(/^<button[^>]*type="button"/)
  })

  it('hides the decorative icons from screen readers', () => {
    expect(render('light')).toContain('aria-hidden="true"')
  })
})
