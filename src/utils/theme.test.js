import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    DARK_MEDIA_QUERY,
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

const systemPrefers = (theme) => (query) => ({ matches: query === DARK_MEDIA_QUERY && theme === 'dark' })

afterEach(() => {
    vi.useRealTimers()
})

describe('isTheme', () => {
    it('accepts only light and dark', () => {
        expect(isTheme('light')).toBe(true)
        expect(isTheme('dark')).toBe(true)
        expect(isTheme('system')).toBe(false)
        expect(isTheme('')).toBe(false)
        expect(isTheme(null)).toBe(false)
        expect(isTheme(undefined)).toBe(false)
    })
})

describe('getNextTheme', () => {
    it('flips between light and dark', () => {
        expect(getNextTheme('light')).toBe('dark')
        expect(getNextTheme('dark')).toBe('light')
    })
})

describe('readStoredTheme', () => {
    it('returns a saved theme', () => {
        expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark')
        expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light')
    })

    it('returns null when nothing is saved', () => {
        expect(readStoredTheme(createStorage())).toBeNull()
    })

    it('ignores values that are not a theme', () => {
        expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: 'purple' }))).toBeNull()
        expect(readStoredTheme(createStorage({ [THEME_STORAGE_KEY]: '' }))).toBeNull()
    })

    it('returns null when storage is missing or blocked', () => {
        expect(readStoredTheme(null)).toBeNull()
        expect(readStoredTheme(undefined)).toBeNull()
        expect(readStoredTheme(createBrokenStorage())).toBeNull()
    })
})

describe('writeStoredTheme', () => {
    it('saves the theme so it can be read back', () => {
        const storage = createStorage()
        expect(writeStoredTheme(storage, 'dark')).toBe(true)
        expect(readStoredTheme(storage)).toBe('dark')
        expect(writeStoredTheme(storage, 'light')).toBe(true)
        expect(readStoredTheme(storage)).toBe('light')
    })

    it('does not save a value that is not a theme', () => {
        const storage = createStorage()
        expect(writeStoredTheme(storage, 'purple')).toBe(false)
        expect(readStoredTheme(storage)).toBeNull()
    })

    it('reports false instead of throwing when storage is blocked', () => {
        expect(writeStoredTheme(createBrokenStorage(), 'dark')).toBe(false)
        expect(writeStoredTheme(null, 'dark')).toBe(false)
    })
})

describe('getSystemTheme', () => {
    it('follows prefers-color-scheme', () => {
        expect(getSystemTheme(systemPrefers('dark'))).toBe('dark')
        expect(getSystemTheme(systemPrefers('light'))).toBe('light')
    })

    it('falls back to light when matchMedia is missing or throws', () => {
        expect(getSystemTheme(null)).toBe('light')
        expect(getSystemTheme(() => { throw new Error('nope') })).toBe('light')
    })
})

describe('resolveTheme', () => {
    it('uses the operating system when there is no saved choice', () => {
        expect(resolveTheme({ storage: createStorage(), matchMedia: systemPrefers('dark') })).toBe('dark')
        expect(resolveTheme({ storage: createStorage(), matchMedia: systemPrefers('light') })).toBe('light')
    })

    it('prefers the saved choice over the operating system', () => {
        const light = createStorage({ [THEME_STORAGE_KEY]: 'light' })
        const dark = createStorage({ [THEME_STORAGE_KEY]: 'dark' })
        expect(resolveTheme({ storage: light, matchMedia: systemPrefers('dark') })).toBe('light')
        expect(resolveTheme({ storage: dark, matchMedia: systemPrefers('light') })).toBe('dark')
    })

    it('falls back to the operating system when the saved value is invalid', () => {
        const storage = createStorage({ [THEME_STORAGE_KEY]: 'purple' })
        expect(resolveTheme({ storage, matchMedia: systemPrefers('dark') })).toBe('dark')
    })

    it('still works when storage is blocked', () => {
        expect(resolveTheme({ storage: createBrokenStorage(), matchMedia: systemPrefers('dark') })).toBe('dark')
    })
})

describe('theme switching with storage', () => {
    it('keeps the explicit choice after toggling, even if the system disagrees', () => {
        const storage = createStorage()
        const matchMedia = systemPrefers('light')

        let theme = resolveTheme({ storage, matchMedia })
        expect(theme).toBe('light')

        theme = getNextTheme(theme)
        writeStoredTheme(storage, theme)

        expect(resolveTheme({ storage, matchMedia })).toBe('dark')
    })
})

describe('isThemeStorageEvent', () => {
    it('matches the theme key and a full clear', () => {
        expect(isThemeStorageEvent({ key: THEME_STORAGE_KEY })).toBe(true)
        expect(isThemeStorageEvent({ key: null })).toBe(true)
    })

    it('ignores other keys', () => {
        expect(isThemeStorageEvent({ key: 'something-else' })).toBe(false)
    })
})

describe('applyTheme', () => {
    it('adds the dark class for dark and removes it for light', () => {
        const root = createRoot()
        applyTheme(root, 'dark')
        expect(root.classList.contains('dark')).toBe(true)
        applyTheme(root, 'light')
        expect(root.classList.contains('dark')).toBe(false)
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

    it('can be stopped early without leaving the class behind', () => {
        vi.useFakeTimers()
        const root = createRoot()

        const stop = startThemeTransition(root)
        stop()
        expect(root.classList.contains(THEME_TRANSITION_CLASS)).toBe(false)

        root.classList.add(THEME_TRANSITION_CLASS)
        vi.advanceTimersByTime(THEME_TRANSITION_MS)
        expect(root.classList.contains(THEME_TRANSITION_CLASS)).toBe(true)
    })
})