import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { SpotlightSearchModal } from '@/components/common/SpotlightSearchModal'

const SpotlightContext = createContext({
  isOpen: false,
  openSearch: () => {},
  closeSearch: () => {},
  toggleSearch: () => {},
})

export function SpotlightProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const previousFocusRef = useRef(null)

  const openSearch = useCallback(() => {
    if (typeof document !== 'undefined') {
      previousFocusRef.current = document.activeElement
    }
    setIsOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    // Restore focus to the element that was focused prior to opening
    setTimeout(() => {
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function' &&
        document.body.contains(previousFocusRef.current)
      ) {
        previousFocusRef.current.focus()
      }
    }, 50)
  }, [])

  const toggleSearch = useCallback(() => {
    if (isOpen) {
      closeSearch()
    } else {
      openSearch()
    }
  }, [isOpen, openSearch, closeSearch])

  // Global Keyboard Shortcut listener: Ctrl+K / Cmd+K
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isK = e.key === 'k' || e.key === 'K'
      const hasModifier = (e.ctrlKey || e.metaKey) && !e.altKey

      // Ctrl + K or Cmd + K opens / toggles the Spotlight Search
      if (hasModifier && isK) {
        e.preventDefault()
        toggleSearch()
        return
      }

      // Escape closes the Spotlight Search if open
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        closeSearch()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
    }
  }, [isOpen, toggleSearch, closeSearch])

  return (
    <SpotlightContext.Provider
      value={{
        isOpen,
        openSearch,
        closeSearch,
        toggleSearch,
      }}
    >
      {children}
      <SpotlightSearchModal isOpen={isOpen} onClose={closeSearch} />
    </SpotlightContext.Provider>
  )
}

export function useSpotlightSearch() {
  const context = useContext(SpotlightContext)
  return (
    context || {
      isOpen: false,
      openSearch: () => {},
      closeSearch: () => {},
      toggleSearch: () => {},
    }
  )
}
export default SpotlightContext
