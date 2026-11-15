
import { useEffect, useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'

const FONT_SIZES = [14, 16, 18, 20, 22]
const DEFAULT_SIZE = 16

function getSavedFontSize() {
  try {
    const saved = Number(localStorage.getItem('civic-font-size'))
    return FONT_SIZES.includes(saved) ? saved : DEFAULT_SIZE
  } catch {
    return DEFAULT_SIZE
  }
}

function getSavedContrast() {
  try {
    return localStorage.getItem('civic-high-contrast') === 'true'
  } catch {
    return false
  }
}

export default function AccessibilityBar() {
  const { t } = useLanguage()

  const [fontSize, setFontSize] = useState(getSavedFontSize)
  const [highContrast, setHighContrast] = useState(getSavedContrast)

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--accessibility-font-size',
      `${fontSize}px`
    )

    try {
      localStorage.setItem('civic-font-size', String(fontSize))
    } catch {
      // Storage may be unavailable
    }
  }, [fontSize])

  useEffect(() => {
    document.documentElement.classList.toggle(
      'high-contrast',
      highContrast
    )

    try {
      localStorage.setItem(
        'civic-high-contrast',
        String(highContrast)
      )
    } catch {
      // Storage may be unavailable
    }
  }, [highContrast])

  const decreaseFont = () => {
    setFontSize((current) =>
      FONT_SIZES[Math.max(0, FONT_SIZES.indexOf(current) - 1)]
    )
  }

  const increaseFont = () => {
    setFontSize((current) =>
      FONT_SIZES[
        Math.min(FONT_SIZES.length - 1, FONT_SIZES.indexOf(current) + 1)
      ]
    )
  }

  return (
    <div
      role="group"
      aria-label={t('accessibilitySettings')}
      className="fixed bottom-4 right-4 z-50 flex flex-wrap items-center gap-2 rounded-xl border border-gray-300 bg-white p-2 shadow-lg dark:border-gray-600 dark:bg-gray-900"
    >
      <button
        type="button"
        onClick={decreaseFont}
        disabled={fontSize === FONT_SIZES[0]}
        aria-label={t('decreaseTextSize')}
        className="rounded-md border px-3 py-2 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:text-white dark:hover:bg-gray-800"
      >
        A−
      </button>

      <button
        type="button"
        onClick={() => setFontSize(DEFAULT_SIZE)}
        aria-label={t('resetTextSize')}
        className="rounded-md border px-3 py-2 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-white dark:hover:bg-gray-800"
      >
        A
      </button>

      <button
        type="button"
        onClick={increaseFont}
        disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
        aria-label={t('increaseTextSize')}
        className="rounded-md border px-3 py-2 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 dark:text-white dark:hover:bg-gray-800"
      >
        A+
      </button>

      <button
        type="button"
        onClick={() => setHighContrast((current) => !current)}
        aria-label={t('toggleHighContrast')}
        aria-pressed={highContrast}
        className="rounded-md border px-3 py-2 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-white dark:hover:bg-gray-800"
      >
        {t('highContrast')} {highContrast ? t('on') : t('off')}
      </button>
    </div>
  )
}
