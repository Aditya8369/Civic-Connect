import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DARK_MEDIA_QUERY,
  applyTheme,
  getBrowserMatchMedia,
  getBrowserStorage,
  getNextTheme,
  getSystemTheme,
  isTheme,
  isThemeStorageEvent,
  readStoredTheme,
  startThemeTransition,
  writeStoredTheme,
} from '@/utils/theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  // What the user picked on purpose. null means "no choice yet, follow the OS".
  const [explicitTheme, setExplicitTheme] = useState(() => readStoredTheme(getBrowserStorage()))
  const [systemTheme, setSystemTheme] = useState(() => getSystemTheme(getBrowserMatchMedia()))
  const theme = explicitTheme ?? systemTheme
  const appliedTheme = useRef(null)

  // Keep the <html> class in sync. The very first run only sets the class; later
  // changes also fade the colors.
  useEffect(() => {
    const root = document.documentElement
    const changed = appliedTheme.current !== null && appliedTheme.current !== theme
    appliedTheme.current = theme
    const stopTransition = changed ? startThemeTransition(root) : undefined
    applyTheme(root, theme)
    return stopTransition
  }, [theme])

  // Follow the operating system while there is no explicit choice.
  useEffect(() => {
    const query = getBrowserMatchMedia()?.(DARK_MEDIA_QUERY)
    if (!query) return undefined
    const onChange = (event) => setSystemTheme(event.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Pick up changes made in another tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (isThemeStorageEvent(event)) setExplicitTheme(readStoredTheme(getBrowserStorage()))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((next) => {
    if (!isTheme(next)) return
    setExplicitTheme(next)
    writeStoredTheme(getBrowserStorage(), next)
  }, [])

  const toggleTheme = useCallback(() => setTheme(getNextTheme(theme)), [setTheme, theme])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
