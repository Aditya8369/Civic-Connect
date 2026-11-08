// Pure helpers for the dark / light theme. Everything takes its browser APIs
// (storage, matchMedia, the root element) as arguments so it can be tested
// without a DOM.

// Keep in sync with the inline script in index.html, which applies the saved
// theme before React loads.
export const THEME_STORAGE_KEY = 'civic-theme'
export const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export const THEME_TRANSITION_CLASS = 'theme-transition'
export const THEME_TRANSITION_MS = 250

export function isTheme(value) {
    return value === 'light' || value === 'dark'
}

export function getNextTheme(theme) {
    return theme === 'dark' ? 'light' : 'dark'
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
    root.classList.toggle('dark', theme === 'dark')
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