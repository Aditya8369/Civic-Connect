import { useState, useEffect, useCallback } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/utils/cn'

export function BackToTop({
  threshold = 300,
  className,
  targetContainer = null,
}) {
  const [isVisible, setIsVisible] = useState(false)

  const checkScroll = useCallback(() => {
    let currentScroll = 0
    if (typeof window !== 'undefined') {
      currentScroll =
        window.scrollY ||
        (typeof document !== 'undefined' && document.documentElement
          ? document.documentElement.scrollTop
          : 0) ||
        0
    }
    if (targetContainer && targetContainer.scrollTop !== undefined) {
      currentScroll = Math.max(currentScroll, targetContainer.scrollTop)
    }
    setIsVisible(currentScroll > threshold)
  }, [threshold, targetContainer])

  useEffect(() => {
    // Initial check
    checkScroll()

    const handleScroll = () => {
      checkScroll()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleScroll, {
        passive: true,
        capture: true,
      })
    }
    if (
      targetContainer &&
      typeof targetContainer.addEventListener === 'function'
    ) {
      targetContainer.addEventListener('scroll', handleScroll, {
        passive: true,
      })
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', handleScroll, { capture: true })
      }
      if (
        targetContainer &&
        typeof targetContainer.removeEventListener === 'function'
      ) {
        targetContainer.removeEventListener('scroll', handleScroll)
      }
    }
  }, [checkScroll, targetContainer])

  const scrollToTop = () => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const behavior = prefersReducedMotion ? 'auto' : 'smooth'

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior })
    } else if (typeof document !== 'undefined') {
      if (document.documentElement) document.documentElement.scrollTop = 0
      if (document.body) document.body.scrollTop = 0
    }

    if (targetContainer && typeof targetContainer.scrollTo === 'function') {
      targetContainer.scrollTo({ top: 0, behavior })
    }

    if (typeof document !== 'undefined') {
      const scrollableMain = document.querySelector('main.overflow-y-auto')
      if (scrollableMain && typeof scrollableMain.scrollTo === 'function') {
        scrollableMain.scrollTo({ top: 0, behavior })
      }
    }
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Back to top"
      title="Back to top"
      data-visible={isVisible}
      aria-hidden={!isVisible}
      tabIndex={isVisible ? 0 : -1}
      className={cn(
        'fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 shadow-lg backdrop-blur-md transition-all duration-200 hover:border-slate-500 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:bottom-8 sm:right-8 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer',
        isVisible
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-3 pointer-events-none invisible',
        className
      )}
    >
      <ArrowUp className="h-4 w-4 shrink-0 text-primary-400" aria-hidden="true" />
      <span className="hidden sm:inline font-medium">Back to top</span>
    </button>
  )
}

export default BackToTop

