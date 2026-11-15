
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import en from '../../locales/en.json'
import hi from '../../locales/hi.json'

const LanguageContext = createContext(null)

const translations = { en, hi }
const STORAGE_KEY = 'civic-connect-language'

function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'hi' || stored === 'en' ? stored : 'en'
  } catch {
    return 'en'
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getStoredLanguage)

  // Synchronize the selected language with the browser document.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  // Keep the language preference synchronized across browser tabs.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return

      const nextLanguage = event.newValue

      if (nextLanguage === 'en' || nextLanguage === 'hi') {
        setLanguageState(nextLanguage)
      }
    }

    window.addEventListener('storage', handleStorage)

    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setLanguage = useCallback((nextLanguage) => {
    if (nextLanguage !== 'en' && nextLanguage !== 'hi') return

    setLanguageState(nextLanguage)

    try {
      localStorage.setItem(STORAGE_KEY, nextLanguage)
    } catch {
      // The language still works for the current session.
    }
  }, [])

  const t = useCallback(
    (key) => {
      return translations[language][key] ?? translations.en[key] ?? key
    },
    [language]
  )

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }

  return context
}
