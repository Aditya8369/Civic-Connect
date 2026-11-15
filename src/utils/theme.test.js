import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    DARK_MEDIA_QUERY,
    MUNICIPAL_THEMES,
    THEME_STORAGE_KEY,
    THEME_TRANSITION_CLASS,
    THEME_TRANSITION_MS,
    applyTheme,
    getNextTheme,
    getSystemTheme,
    isTheme,
    isThemeStorageEvent,
    readStoredTheme,
    resolveTheme,
    startThemeTransition,
    writeStoredTheme,
} from './theme'

function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial))
    return {
        getItem: (key) => (data.has(key) ? data.get(key) : null),
        setItem: (key, value) => data.set(key, String(value)),
    }
}

function createBrokenStorage() {
    const fail = () => {
        throw new Error('storage is blocked')
    }
    return { getItem: fail, setItem: fail }
}

function createRoot() {
    const classes = new Set()
    return {
        dataset: {},
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            toggle: (name, force) => {
                if (force) classes.add(name)
                else classes.delete(name)
            },
            contains: (name) => classes.has(name),
        },
    }
}

function relativeLuminance(hex) {
    const clean = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((offset) => {
        const channel = parseInt(clean.slice(offset, offset + 2), 16) / 255
        return channel <= 0.03928
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(hexA, hexB) {
    const lumA = relativeLuminance(hexA)
    const lumB = relativeLuminance(hexB)
    const lighter = Math.max(lumA, lumB)
    const darker = Math.min(lumA, lumB)
    return (lighter + 0.05) / (darker + 0.05)
}

const systemPrefers = (theme) => (query) => ({ matches: query === DARK_MEDIA_QUERY && theme === 'dark' })

afterEach(() => {
    vi.useRealTimers()
})

describe('isTheme', () => {
    it('accepts light, dark, warm-civic, and high-contrast', () => {
        expect(isTheme('light')).toBe(true)
        expect(isTheme('dark')).toBe(true)
        expect(isTheme('warm-civic')).toBe(true)
        expect(isTheme('high-contrast')).toBe(true)
        expect(isTheme('system')).toBe(false)
        expect(isTheme('')).toBe(false)
        expect(isTheme(null)).toBe(false)
        expect(isTheme(undefined)).toBe(false)
    })
})

describe('getNextTheme', () => {
    it('cycles through light -> dark -> warm-civic -> high-contrast -> light', () => {
        expect(getNextTheme('light')).toBe('dark')
        expect(getNextTheme('dark')).toBe('warm-civic')
        expect(getNextTheme('warm-civic')).toBe('high-contrast')
        expect(getNextTheme('high-contrast')).toBe('light')
    })
})

describe('readStoredTheme & writeStoredTheme', () => {
    it('persists and reads back all 4 municipal themes in localStorage', () => {
        const storage = createStorage()
        for (const theme of ['light', 'dark', 'warm-civic', 'high-contrast']) {
            expect(writeStoredTheme(storage, theme)).toBe(true)
            expect(readStoredTheme(storage)).toBe(theme)
            expect(resolveTheme({ storage, matchMedia: systemPrefers('light') })).toBe(theme)
        }
    })

    it('returns null when nothing is saved or value is invalid', () => {
        expect(readStoredTheme(createStorage())).toBeNull()
        expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'purple' }))).toBeNull()
        expect(readStoredTheme(null)).toBeNull()
        expect(readStoredTheme(createBrokenStorage())).toBeNull()
    })

    it('does not save an invalid theme and handles blocked storage gracefully', () => {
        const storage = createStorage()
        expect(writeStoredTheme(storage, 'purple')).toBe(false)
        expect(readStoredTheme(storage)).toBeNull()
        expect(writeStoredTheme(createBrokenStorage(), 'warm-civic')).toBe(false)
    })
})

describe('getSystemTheme & resolveTheme', () => {
    it('follows prefers-color-scheme when no explicit choice exists', () => {
        expect(getSystemTheme(systemPrefers('dark'))).toBe('dark')
        expect(getSystemTheme(systemPrefers('light'))).toBe('light')
        expect(resolveTheme({ storage: createStorage(), matchMedia: systemPrefers('dark') })).toBe('dark')
    })

    it('prefers saved municipal accessibility theme over OS preference', () => {
        const warm = createStorage({ [THEME_STORAGE_KEY]: 'warm-civic' })
        const hc = createStorage({ [THEME_STORAGE_KEY]: 'high-contrast' })
        expect(resolveTheme({ storage: warm, matchMedia: systemPrefers('dark') })).toBe('warm-civic')
        expect(resolveTheme({ storage: hc, matchMedia: systemPrefers('light') })).toBe('high-contrast')
    })
})

describe('isThemeStorageEvent', () => {
    it('matches the theme key and a full clear', () => {
        expect(isThemeStorageEvent({ key: THEME_STORAGE_KEY })).toBe(true)
        expect(isThemeStorageEvent({ key: null })).toBe(true)
        expect(isThemeStorageEvent({ key: 'something-else' })).toBe(false)
    })
})

describe('applyTheme', () => {
    it('applies exact root classes for light, dark, warm-civic, and high-contrast', () => {
        const root = createRoot()

        applyTheme(root, 'dark')
        expect(root.classList.contains('dark')).toBe(true)
        expect(root.classList.contains('theme-warm-civic')).toBe(false)
        expect(root.classList.contains('theme-high-contrast')).toBe(false)

        applyTheme(root, 'warm-civic')
        expect(root.classList.contains('theme-warm-civic')).toBe(true)
        expect(root.classList.contains('dark')).toBe(false)
        expect(root.classList.contains('theme-high-contrast')).toBe(false)
        expect(root.dataset.theme).toBe('warm-civic')

        applyTheme(root, 'high-contrast')
        expect(root.classList.contains('theme-high-contrast')).toBe(true)
        expect(root.classList.contains('dark')).toBe(true)
        expect(root.classList.contains('theme-warm-civic')).toBe(false)
        expect(root.dataset.theme).toBe('high-contrast')

        applyTheme(root, 'light')
        expect(root.classList.contains('dark')).toBe(false)
        expect(root.classList.contains('theme-warm-civic')).toBe(false)
        expect(root.classList.contains('theme-high-contrast')).toBe(false)
        expect(root.dataset.theme).toBe('light')
    })
})

describe('WCAG AAA contrast compliance', () => {
    it('verifies high-contrast yellow/black theme exceeds 7:1 WCAG AAA contrast ratio', () => {
        const hc = MUNICIPAL_THEMES.find((t) => t.id === 'high-contrast')
        expect(hc).toBeDefined()
        const ratio = contrastRatio(hc.swatches.bg, hc.swatches.text)
        expect(ratio).toBeGreaterThanOrEqual(7)
    })

    it('verifies warm-civic parchment theme exceeds 7:1 WCAG AAA contrast ratio', () => {
        const warm = MUNICIPAL_THEMES.find((t) => t.id === 'warm-civic')
        expect(warm).toBeDefined()
        const ratio = contrastRatio(warm.swatches.bg, warm.swatches.text)
        expect(ratio).toBeGreaterThanOrEqual(7)
    })
})

describe('startThemeTransition', () => {
    it('adds the transition class and removes it after the fade', () => {
        vi.useFakeTimers()
        const root = createRoot()

        startThemeTransition(root)
        expect(root.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

        vi.advanceTimersByTime(THEME_TRANSITION_MS - 1)
        expect(root.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)

        vi.advanceTimersByTime(1)
        expect(root.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)
    })
})