import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '@/contexts/ThemeContext'

vi.mock('@/contexts/ThemeContext', () => ({ useTheme: vi.fn() }))

function render(theme) {
    useTheme.mockReturnValue({ theme, setTheme: vi.fn(), toggleTheme: vi.fn() })
    return renderToStaticMarkup(<ThemeToggle />)
}

describe('ThemeToggle', () => {
    it('renders accessible listbox trigger with active theme label for all 4 themes', () => {
        expect(render('light')).toContain('aria-label="Theme selector: Civic Light"')
        expect(render('dark')).toContain('aria-label="Theme selector: Civic Dark"')
        expect(render('warm-civic')).toContain('aria-label="Theme selector: Warm Civic Parchment"')
        expect(render('high-contrast')).toContain('aria-label="Theme selector: Ultra High-Contrast Yellow/Black"')
    })

    it('exposes accessible popup listbox attributes and button type', () => {
        const html = render('warm-civic')
        expect(html).toContain('type="button"')
        expect(html).toContain('aria-haspopup="listbox"')
        expect(html).toContain('aria-expanded="false"')
    })

    it('hides decorative icons and preview swatches from screen readers', () => {
        expect(render('high-contrast')).toContain('aria-hidden="true"')
    })
})