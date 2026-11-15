
import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useLanguage } from '@/contexts/LanguageContext'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function MobileSidebar({ open, onClose }) {
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)

  const { language, setLanguage } = useLanguage()

  // Keep the latest close callback without restarting the focus effect.
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    const previouslyFocusedElement = document.activeElement
    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    const focusableElements = panel?.querySelectorAll(FOCUSABLE_SELECTOR)

    // Move keyboard focus into the drawer.
    if (focusableElements?.length) {
      focusableElements[0].focus()
    } else {
      panel?.focus()
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow

      // Restore focus to the element that opened the drawer.
      if (
        previouslyFocusedElement &&
        previouslyFocusedElement.isConnected &&
        typeof previouslyFocusedElement.focus === 'function'
      ) {
        previouslyFocusedElement.focus()
      }
    }
  }, [open])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCloseRef.current?.()
      return
    }

    if (event.key !== 'Tab') return

    const panel = panelRef.current
    if (!panel) return

    const focusableElements = Array.from(
      panel.querySelectorAll(FOCUSABLE_SELECTOR)
    ).filter(
      (element) =>
        !element.hasAttribute('disabled') &&
        element.getAttribute('aria-hidden') !== 'true'
    )

    if (focusableElements.length === 0) {
      event.preventDefault()
      panel.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    // Prevent focus from escaping the drawer.
    if (!panel.contains(activeElement)) {
      event.preventDefault()
      ;(event.shiftKey ? lastElement : firstElement).focus()
      return
    }

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
            onClick={() => onCloseRef.current?.()}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-y-0 left-0 z-50 w-64 outline-none"
          >
            <button
              type="button"
              onClick={() => onCloseRef.current?.()}
              aria-label="Close navigation menu"
              className="absolute -right-10 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="h-full overflow-y-auto">
              {/* Mobile language switcher */}
              <div className="flex items-center justify-between border-b border-gray-200/20 px-5 py-3">
                <span className="text-sm font-medium text-gray-500">
                  Language
                </span>

                <div
                  className="flex items-center gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800"
                  aria-label="Select language"
                >
                  <button
                    type="button"
                    onClick={() => setLanguage('en')}
                    aria-pressed={language === 'en'}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      language === 'en'
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    EN
                  </button>

                  <button
                    type="button"
                    onClick={() => setLanguage('hi')}
                    aria-pressed={language === 'hi'}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      language === 'hi'
                        ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    }`}
                  >
                    हिंदी
                  </button>
                </div>
              </div>

              <Sidebar />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
