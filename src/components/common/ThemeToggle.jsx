import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Contrast, Moon, ScrollText, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { MUNICIPAL_THEMES } from '@/utils/theme'
import { cn } from '@/utils/cn'

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  'warm-civic': ScrollText,
  'high-contrast': Contrast,
}

export function ThemeToggle({ className }) {
  const { theme, setTheme, toggleTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  const currentTheme =
    MUNICIPAL_THEMES.find((item) => item.id === theme) ?? MUNICIPAL_THEMES[0]
  const ActiveIcon = THEME_ICONS[currentTheme.id] ?? Sun

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSelectTheme = (nextId) => {
    if (typeof setTheme === 'function') {
      setTheme(nextId)
    } else if (typeof toggleTheme === 'function') {
      toggleTheme()
    }
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div ref={containerRef} className={cn('relative inline-flex items-center', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme selector: ${currentTheme.label}`}
        title={`Theme: ${currentTheme.label} (Click to switch accessibility themes)`}
        className={cn(
          'inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-semibold shadow-xs transition-all',
          'bg-white text-gray-800 border-gray-200 hover:bg-gray-50 active:scale-[0.98]',
          'dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700 dark:hover:bg-gray-800',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
        )}
      >
        <ActiveIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span
          className="inline-flex items-center -space-x-1"
          aria-hidden="true"
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-black/25"
            style={{ backgroundColor: currentTheme.swatches.bg }}
          />
          <span
            className="h-3.5 w-3.5 rounded-full border border-black/25"
            style={{ backgroundColor: currentTheme.swatches.accent }}
          />
        </span>
        <span className="hidden sm:inline">{currentTheme.shortLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 opacity-75 transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Select civic accessibility theme"
          className={cn(
            'absolute right-0 top-full z-50 mt-2 w-76 origin-top-right rounded-2xl border p-2 shadow-xl',
            'bg-white border-gray-200 text-gray-900',
            'dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100',
          )}
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider opacity-70">
            Municipal Display &amp; Accessibility
          </div>

          <div className="space-y-1">
            {MUNICIPAL_THEMES.map((option) => {
              const OptionIcon = THEME_ICONS[option.id] ?? Sun
              const selected = option.id === currentTheme.id

              return (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-theme-option={option.id}
                  onClick={() => handleSelectTheme(option.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                    selected
                      ? 'border-blue-600 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/50'
                      : 'border-transparent hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/80',
                  )}
                >
                  {/* Tactile multi-tone preview swatch */}
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-9 w-9 shrink-0 flex-col justify-between overflow-hidden rounded-lg border border-black/25 p-1 shadow-inner"
                    style={{ backgroundColor: option.swatches.bg }}
                  >
                    <span
                      className="h-1.5 w-5 rounded-full"
                      style={{ backgroundColor: option.swatches.text }}
                    />
                    <span className="flex items-center justify-between">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: option.swatches.accent }}
                      />
                      <OptionIcon
                        className="h-3 w-3"
                        style={{ color: option.swatches.text }}
                      />
                    </span>
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-sm font-bold">
                        {option.label}
                      </span>
                      {selected && (
                        <Check
                          className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs opacity-80">
                      {option.description}
                    </span>
                    <span className="mt-1 inline-block rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">
                      {option.wcagBadge}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}