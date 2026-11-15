// Pure helpers for the municipal theme system (Light, Dark, Warm Civic Parchment,
// and Ultra High-Contrast Yellow/Black). Everything takes its browser APIs
// (storage, matchMedia, the root element) as arguments so it can be tested
// without a DOM.

// Keep in sync with the inline script in index.html, which applies the saved
// theme before React loads.
export const THEME_STORAGE_KEY = 'civic-theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const THEME_TRANSITION_CLASS = 'theme-transition'
export const THEME_TRANSITION_MS = 250

export const VALID_THEMES = ['light', 'dark', 'warm-civic', 'high-contrast']

export const THEME_CLASS_MAP = {
    light: [],
    dark: ['dark'],
    'warm-civic': ['theme-warm-civic'],
    'high-contrast': ['dark', 'theme-high-contrast'],
}

export const ALL_THEME_CLASSES = ['dark', 'theme-warm-civic', 'theme-high-contrast']

export const MUNICIPAL_THEMES = [
    {
        id: 'light',
        label: 'Civic Light',
        shortLabel: 'Light',
        description: 'Crisp daytime municipal interface',
        wcagBadge: 'WCAG AA',
        swatches: {
            bg: '#f9fafb',
            surface: '#ffffff',
            accent: '#2563eb',
            text: '#111827',
        },
    },
    {
        id: 'dark',
        label: 'Civic Dark',
        shortLabel: 'Dark',
        description: 'Low-glare evening slate palette',
        wcagBadge: 'WCAG AA',
        swatches: {
            bg: '#030712',
            surface: '#111827',
            accent: '#3b82f6',
            text: '#f3f4f6',
        },
    },
    {
        id: 'warm-civic',
        label: 'Warm Civic Parchment',
        shortLabel: 'Warm Civic',
        description: 'Eye-comfort paper tone for extended reading',
        wcagBadge: 'WCAG AAA Text',
        swatches: {
            bg: '#f6f1e3',
            surface: '#fffdf7',
            accent: '#8c3b0c',
            text: '#1f1913',
        },
    },
    {
        id: 'high-contrast',
        label: 'Ultra High-Contrast Yellow/Black',
        shortLabel: 'High-Contrast',
        description: 'Maximum 19.5:1 contrast for low-vision accessibility',
        wcagBadge: 'WCAG AAA 7:1+',
        swatches: {
            bg: '#000000',
            surface: '#0a0a0a',
            accent: '#ffea00',
            text: '#ffea00',
        },
    },
]

export function isTheme(value) {
    return VALID_THEMES.includes(value)
}

export function getNextTheme(theme) {
    const idx = VALID_THEMES.indexOf(theme)
    if (idx === -1) return 'dark'
    return VALID_THEMES[(idx + 1) % VALID_THEMES.length]
}

// Reading window.localStorage can itself throw when site data is blocked.
export function getBrowserStorage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage
    } catch {
        return null
    }
}

export function getBrowserMatchMedia() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
    return window.matchMedia.bind(window)
}

// The theme the user picked on purpose, or null if there is none (or the value
// is not a valid theme).
export function readStoredTheme(storage) {
    try {
        const value = storage?.getItem(THEME_STORAGE_KEY)
        return isTheme(value) ? value : null
    } catch {
        return null
    }
}

export function writeStoredTheme(storage, theme) {
    if (!isTheme(theme)) return false
    try {
        storage.setItem(THEME_STORAGE_KEY, theme)
        return true
    } catch {
        return false
    }
}

export function getSystemTheme(matchMedia) {
    try {
        return matchMedia?.(DARK_MEDIA_QUERY)?.matches ? 'dark' : 'light'
    } catch {
        return 'light'
    }
}

// An explicit choice wins. Without one, follow the operating system.
export function resolveTheme({ storage, matchMedia }) {
    return readStoredTheme(storage) ?? getSystemTheme(matchMedia)
}

// A "storage" event is about our key, or about the whole store being cleared.
export function isThemeStorageEvent(event) {
    return event.key === null || event.key === THEME_STORAGE_KEY
}

export function applyTheme(root, theme) {
    const resolved = isTheme(theme) ? theme : 'light'
    const activeClasses = new Set(THEME_CLASS_MAP[resolved])

    for (const cls of ALL_THEME_CLASSES) {
        root.classList.toggle(cls, activeClasses.has(cls))
    }

    if (root.dataset) {
        root.dataset.theme = resolved
    }
}

// Adds a class that turns on color transitions for a moment, so the whole page
// fades between themes. It is only added when the theme changes, so normal page
// loads and hover effects are not affected. Returns a function that stops it.
export function startThemeTransition(root) {
    root.classList.add(THEME_TRANSITION_CLASS)
    const timer = setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), THEME_TRANSITION_MS)
    return () => {
        clearTimeout(timer)
        root.classList.remove(THEME_TRANSITION_CLASS)
    }
}