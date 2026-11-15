
import { useState, useRef, useCallback, useEffect } from 'react'
import { ArrowLeftRight, CheckCircle2, Camera, Sparkles } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export function BeforeAfterComparisonSlider({
  beforeImage,
  afterImage,
  beforeLabel,
  afterLabel,
  beforeAlt,
  afterAlt,
  className = '',
}) {
  const { t } = useLanguage()

  const resolvedBeforeLabel = beforeLabel || t('beforeReported')
  const resolvedAfterLabel = afterLabel || t('afterResolved')
  const resolvedBeforeAlt = beforeAlt || t('beforeImageAlt')
  const resolvedAfterAlt = afterAlt || t('afterImageAlt')

  const [sliderPosition, setSliderPosition] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const [viewMode, setViewMode] = useState('slider')
  const containerRef = useRef(null)

  const handleMove = useCallback((clientX) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setSliderPosition(percentage)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const onPointerMove = (e) => {
      handleMove(e.clientX)
    }
    const onPointerUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [isDragging, handleMove])

  const handlePointerDown = (clientX) => {
    setIsDragging(true)
    handleMove(clientX)
  }

  // Fallback 1: Neither image provided
  if (!beforeImage && !afterImage) {
    return (
      <div
        data-testid="no-photos-fallback"
        className={`relative overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20 ${className}`}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 mb-3">
          <Sparkles className="h-6 w-6" />
        </div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('onSiteResolutionVerified')}
        </h4>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-sm mx-auto">
          {t('onSiteResolutionDescription')}
        </p>
      </div>
    )
  }

  // Fallback 2: Only Before image provided
  if (beforeImage && !afterImage) {
    return (
      <div
        data-testid="before-only-fallback"
        className={`relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-900 ${className}`}
      >
        <img
          src={beforeImage}
          alt={resolvedBeforeAlt}
          className="h-64 sm:h-80 w-full object-cover"
        />
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <Camera className="h-3.5 w-3.5 text-amber-400" />
            {resolvedBeforeLabel}
          </span>
        </div>
        <div className="absolute bottom-3 inset-x-3 rounded-lg bg-emerald-900/85 p-2.5 backdrop-blur-sm flex items-center gap-2 text-white">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <p className="text-xs font-medium">
            {t('resolutionVerifiedByCrew')}
          </p>
        </div>
      </div>
    )
  }

  // Fallback 3: Only After image provided
  if (!beforeImage && afterImage) {
    return (
      <div
        data-testid="after-only-fallback"
        className={`relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-900 ${className}`}
      >
        <img
          src={afterImage}
          alt={resolvedAfterAlt}
          className="h-64 sm:h-80 w-full object-cover"
        />
        <div className="absolute top-3 right-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {resolvedAfterLabel}
          </span>
        </div>
      </div>
    )
  }

  // Standard case: Both Before and After images are present
  return (
    <div className={className}>
      {/* View Toggle */}
      <div className="flex items-center justify-end mb-2">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white/90 p-0.5 dark:border-gray-800 dark:bg-gray-800/90 shadow-2xs text-xs">
          <button
            type="button"
            onClick={() => setViewMode('slider')}
            aria-pressed={viewMode === 'slider'}
            data-testid="toggle-slider-view"
            className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
              viewMode === 'slider'
                ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {t('comparisonSlider')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            aria-pressed={viewMode === 'cards'}
            data-testid="toggle-cards-view"
            className={`px-2.5 py-1 rounded-md transition-all font-medium cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            {t('sideBySideCards')}
          </button>
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div data-testid="before-after-cards" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-900 shadow-xs">
            <img src={beforeImage} alt={resolvedBeforeAlt} className="h-56 sm:h-64 w-full object-cover" />
            <div className="absolute top-3 left-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-amber-300 backdrop-blur-sm">
                <Camera className="h-3.5 w-3.5" />
                {resolvedBeforeLabel}
              </span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-900 shadow-xs">
            <img src={afterImage} alt={resolvedAfterAlt} className="h-56 sm:h-64 w-full object-cover" />
            <div className="absolute top-3 right-3">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {resolvedAfterLabel}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          data-testid="before-after-slider"
          className="relative select-none overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-900 shadow-sm"
          onPointerDown={(e) => handlePointerDown(e.clientX)}
        >
          {/* Base Layer: After Image */}
          <img
            src={afterImage}
            alt={resolvedAfterAlt}
            className="h-64 sm:h-80 w-full object-cover pointer-events-none"
          />

          {/* Top Layer: Before Image with dynamic clip-path */}
          <div
            className="absolute inset-0 overflow-hidden pointer-events-none"
            style={{
              clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
            }}
          >
            <img
              src={beforeImage}
              alt={resolvedBeforeAlt}
              className="h-64 sm:h-80 w-full object-cover"
            />
          </div>

          {/* Badges */}
          <div className="pointer-events-none absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-amber-300 backdrop-blur-sm">
              {resolvedBeforeLabel}
            </span>
          </div>
          <div className="pointer-events-none absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {resolvedAfterLabel}
            </span>
          </div>

          {/* Divider Bar & Handle */}
          <div
            className="absolute top-0 bottom-0 z-10 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.5)]"
            style={{ left: `calc(${sliderPosition}% - 2px)` }}
          >
            <div
              role="slider"
              aria-label={t('beforeAfterSliderLabel')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPosition)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                  e.preventDefault()
                  setSliderPosition((p) => Math.max(0, p - 5))
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  setSliderPosition((p) => Math.min(100, p + 5))
                } else if (e.key === 'Home') {
                  e.preventDefault()
                  setSliderPosition(0)
                } else if (e.key === 'End') {
                  e.preventDefault()
                  setSliderPosition(100)
                }
              }}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-lg border border-gray-200 transition-transform hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </div>
          </div>

          {/* Hidden range input for accessibility & keyboard / assistive devices */}
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(sliderPosition)}
            onChange={(e) => setSliderPosition(Number(e.target.value))}
            aria-label={t('imageComparisonRangeLabel')}
            className="sr-only"
          />

          {/* Instruction hint */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
            {t('dragToCompare')}
          </div>
        </div>
      )}
    </div>
  )
}

export default BeforeAfterComparisonSlider
