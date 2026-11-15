
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Search,
  X,
  MapPin,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Check,
  RotateCcw,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { getDisplayId } from '@/firebase/complaintId'
import { Badge } from '@/components/ui/badge'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import {
  matchesReport,
  extractAvailableWards,
  SPOTLIGHT_CATEGORIES,
  SPOTLIGHT_PRIORITIES,
  SPOTLIGHT_STATUSES,
} from '@/utils/spotlightSearch'
import {
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from '@/utils/searchHistory'
import { useSpotlightReports } from '@/hooks/useSpotlightReports'
import { cn } from '@/utils/cn'

const statusVariant = {
  Pending: 'destructive',
  'In Progress': 'warning',
  Resolved: 'success',
  Rejected: 'secondary',
  Reopened: 'warning',
}

const categoryTranslationKeys = {
  'Potholes & Road Damage': 'categoryPotholesRoadDamage',
  'Streetlight Issues': 'categoryStreetlightIssues',
  'Water Leakage': 'categoryWaterLeakage',
  'Garbage & Sanitation': 'categoryGarbageSanitation',
  'Noise Pollution': 'categoryNoisePollution',
  'Illegal Construction': 'categoryIllegalConstruction',
  'Traffic Issues': 'categoryTrafficIssues',
  Other: 'categoryOther',
}

const statusTranslationKeys = {
  Pending: 'statusPending',
  'In Progress': 'statusInProgress',
  Resolved: 'statusResolved',
  Rejected: 'statusRejected',
  Reopened: 'statusReopened',
  'Merged - Duplicate': 'statusMerged',
}

const priorityTranslationKeys = {
  Low: 'priorityLow',
  Medium: 'priorityMedium',
  High: 'priorityHigh',
  Critical: 'priorityCritical',
}

function getCategoryLabel(category, t) {
  return t(categoryTranslationKeys[category] || category)
}

function getStatusLabel(status, t) {
  return t(statusTranslationKeys[status] || status)
}

function getPriorityLabel(priority, t) {
  return t(priorityTranslationKeys[priority] || priority)
}

function HighlightMatch({ text, query }) {
  if (!text) return null
  if (!query || !query.trim()) return text

  const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escapedQuery})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark
            key={index}
            className="rounded bg-yellow-200/90 px-0.5 text-gray-900 dark:bg-yellow-800/60 dark:text-yellow-100"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

export function SpotlightSearchModal({
  isOpen,
  onClose,
  reports: customReports = null,
}) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [selectedPriority, setSelectedPriority] = useState(null)
  const [selectedWard, setSelectedWard] = useState(null)
  const [selectedStatus, setSelectedStatus] = useState(null)
  const [openFilterMenu, setOpenFilterMenu] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentSearches, setRecentSearches] = useState([])

  // References
  const inputRef = useRef(null)
  const resultsContainerRef = useRef(null)
  const filterBarRef = useRef(null)

  // Fetch reports data with role-based restrictions
  const {
    reports: fetchedReports,
    loading,
    error,
    retry,
  } = useSpotlightReports({
    enabled: isOpen,
    overrideReports: customReports,
  })

  // Load recent searches from localStorage
  const refreshRecentSearches = useCallback(() => {
    setRecentSearches(getRecentSearches(user?.uid))
  }, [user?.uid])

  useEffect(() => {
    if (isOpen) {
      refreshRecentSearches()
      setSelectedIndex(0)
      setOpenFilterMenu(null)

      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery('')
      setSelectedCategory(null)
      setSelectedPriority(null)
      setSelectedWard(null)
      setSelectedStatus(null)
      setOpenFilterMenu(null)
      setSelectedIndex(0)
    }
  }, [isOpen, refreshRecentSearches])

  // Close filter popover menu on click outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (filterBarRef.current && !filterBarRef.current.contains(e.target)) {
        setOpenFilterMenu(null)
      }
    }

    if (openFilterMenu) {
      document.addEventListener('mousedown', handleOutsideClick)

      return () => {
        document.removeEventListener('mousedown', handleOutsideClick)
      }
    }
  }, [openFilterMenu])

  // Available filter options derived from constants & actual data
  const availableCategories = useMemo(() => {
    const set = new Set(SPOTLIGHT_CATEGORIES)

    fetchedReports.forEach((r) => {
      if (r?.category && typeof r.category === 'string') {
        set.add(r.category.trim())
      }
    })

    return Array.from(set).sort()
  }, [fetchedReports])

  const availablePriorities = useMemo(() => {
    const set = new Set(SPOTLIGHT_PRIORITIES)

    fetchedReports.forEach((r) => {
      if (r?.priority && typeof r.priority === 'string') {
        set.add(r.priority.trim())
      }
    })

    return Array.from(set)
  }, [fetchedReports])

  const availableStatuses = useMemo(() => {
    const set = new Set(SPOTLIGHT_STATUSES)

    fetchedReports.forEach((r) => {
      if (r?.status && typeof r.status === 'string') {
        set.add(r.status.trim())
      }
    })

    return Array.from(set)
  }, [fetchedReports])

  const availableWards = useMemo(() => {
    return extractAvailableWards(fetchedReports)
  }, [fetchedReports])

  // Filtered reports
  const activeFilters = useMemo(
    () => ({
      category: selectedCategory,
      priority: selectedPriority,
      ward: selectedWard,
      status: selectedStatus,
    }),
    [selectedCategory, selectedPriority, selectedWard, selectedStatus]
  )

  const hasActiveFilters = Boolean(
    selectedCategory || selectedPriority || selectedWard || selectedStatus
  )

  const isSearchEmpty = !searchQuery.trim()

  const filteredReports = useMemo(() => {
    if (isSearchEmpty && !hasActiveFilters) {
      return []
    }

    return fetchedReports.filter((report) =>
      matchesReport(report, searchQuery, activeFilters)
    )
  }, [
    fetchedReports,
    searchQuery,
    activeFilters,
    isSearchEmpty,
    hasActiveFilters,
  ])

  // Keep selected index within bounds
  useEffect(() => {
    if (filteredReports.length === 0) {
      setSelectedIndex(-1)
    } else if (
      selectedIndex < 0 ||
      selectedIndex >= filteredReports.length
    ) {
      setSelectedIndex(0)
    }
  }, [filteredReports.length, selectedIndex])

  // Scroll active item into view safely
  useEffect(() => {
    if (selectedIndex >= 0 && resultsContainerRef.current) {
      const activeEl = resultsContainerRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      )

      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  // Handle report selection and navigation
  const handleSelectReport = useCallback(
    (report) => {
      if (!report) return

      if (searchQuery.trim()) {
        saveRecentSearch(user?.uid, searchQuery)
        refreshRecentSearches()
      }

      onClose?.()

      const reportId = report.id || report.complaintId

      if (user?.role === 'admin') {
        navigate(`/admin/reports/${reportId}`)
      } else {
        navigate(`/report/${reportId}`)
      }
    },
    [searchQuery, user, onClose, navigate, refreshRecentSearches]
  )

  // Keyboard navigation within the modal
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()

      if (filteredReports.length > 0) {
        setSelectedIndex((prev) =>
          prev < filteredReports.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()

      if (filteredReports.length > 0) {
        setSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredReports.length - 1
        )
      }
    } else if (e.key === 'Enter') {
      if (
        selectedIndex >= 0 &&
        selectedIndex < filteredReports.length &&
        filteredReports[selectedIndex]
      ) {
        e.preventDefault()
        handleSelectReport(filteredReports[selectedIndex])
      } else if (searchQuery.trim() && filteredReports.length > 0) {
        e.preventDefault()
        handleSelectReport(filteredReports[0])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()

      if (openFilterMenu) {
        setOpenFilterMenu(null)
      } else {
        onClose?.()
      }
    }
  }

  // Clear filters
  const handleClearAll = () => {
    setSelectedCategory(null)
    setSelectedPriority(null)
    setSelectedWard(null)
    setSelectedStatus(null)
    setSearchQuery('')
    setSelectedIndex(0)
    setOpenFilterMenu(null)
    inputRef.current?.focus()
  }

  const handleClearFiltersOnly = () => {
    setSelectedCategory(null)
    setSelectedPriority(null)
    setSelectedWard(null)
    setSelectedStatus(null)
    setSelectedIndex(0)
    setOpenFilterMenu(null)
    inputRef.current?.focus()
  }

  // Recent searches actions
  const handleExecuteRecentSearch = (term) => {
    setSearchQuery(term)
    setSelectedIndex(0)
    inputRef.current?.focus()
  }

  const handleRemoveRecent = (e, term) => {
    e.stopPropagation()
    removeRecentSearch(user?.uid, term)
    refreshRecentSearches()
  }

  const handleClearHistory = () => {
    clearRecentSearches(user?.uid)
    refreshRecentSearches()
  }

  const activeOptionId =
    selectedIndex >= 0 ? `spotlight-option-${selectedIndex}` : undefined

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => !open && onClose?.()}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <DialogPrimitive.Content
          aria-label={t('spotlightSearch')}
          aria-describedby="spotlight-description"
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[12%] sm:top-[15%] z-50 w-[95vw] sm:w-[90vw] max-w-2xl -translate-x-1/2 overflow-hidden rounded-2xl border border-gray-200 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-gray-800 dark:bg-gray-900/95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">
            {t('spotlightSearch')}
          </DialogPrimitive.Title>

          <DialogPrimitive.Description
            id="spotlight-description"
            className="sr-only"
          >
            {t('spotlightSearchDescription')}
          </DialogPrimitive.Description>

          {/* Search Header Bar */}
          <div className="relative flex items-center border-b border-gray-200 px-4 py-3.5 dark:border-gray-800">
            <Search className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />

            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label={t('spotlightSearchInputLabel')}
              aria-autocomplete="list"
              aria-expanded={filteredReports.length > 0}
              aria-controls="spotlight-results-list"
              aria-activedescendant={activeOptionId}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSelectedIndex(0)
              }}
              placeholder={t('spotlightSearchPlaceholder')}
              className="flex-1 bg-transparent px-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('')
                  inputRef.current?.focus()
                }}
                className="mr-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                aria-label={t('clearSearchInput')}
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <DialogPrimitive.Close
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none dark:hover:bg-gray-800 dark:hover:text-gray-300"
              aria-label={t('closeSpotlightSearch')}
            >
              <kbd className="hidden sm:inline-flex items-center rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-mono text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                ESC
              </kbd>
              <X className="h-4 w-4 sm:hidden" />
            </DialogPrimitive.Close>
          </div>

          {/* Quick Filter Chips Bar */}
          <div
            ref={filterBarRef}
            className="relative flex items-center gap-1.5 overflow-x-auto border-b border-gray-100 bg-gray-50/60 px-4 py-2.5 dark:border-gray-800/60 dark:bg-gray-950/40"
          >
            {/* Category Filter */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t('filterByCategory')}
                onClick={() =>
                  setOpenFilterMenu((prev) =>
                    prev === 'category' ? null : 'category'
                  )
                }
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                  selectedCategory
                    ? 'bg-primary-100/90 text-primary-800 border-primary-300 dark:bg-primary-950 dark:text-primary-300 dark:border-primary-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
                )}
              >
                <span>
                  {t('category')}
                  {selectedCategory
                    ? `: ${getCategoryLabel(selectedCategory, t)}`
                    : ''}
                </span>

                {selectedCategory ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedCategory(null)
                      setSelectedIndex(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        setSelectedCategory(null)
                        setSelectedIndex(0)
                      }
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800"
                    aria-label={t('clearCategoryFilter')}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <ChevronDown className="h-3 w-3 opacity-60" />
                )}
              </button>

              {openFilterMenu === 'category' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 max-h-60 w-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900 animate-in fade-in-50 zoom-in-95"
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {t('categories')}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedCategory(null)
                      setOpenFilterMenu(null)
                      setSelectedIndex(0)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span>{t('allCategories')}</span>
                    {!selectedCategory && (
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    )}
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  {availableCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSelectedCategory(cat)
                        setOpenFilterMenu(null)
                        setSelectedIndex(0)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 text-left"
                    >
                      <span className="truncate">
                        {getCategoryLabel(cat, t)}
                      </span>
                      {selectedCategory === cat && (
                        <Check className="h-3.5 w-3.5 text-primary-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Priority Filter */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t('filterByPriority')}
                onClick={() =>
                  setOpenFilterMenu((prev) =>
                    prev === 'priority' ? null : 'priority'
                  )
                }
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                  selectedPriority
                    ? 'bg-amber-100/90 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
                )}
              >
                <span>
                  {t('priority')}
                  {selectedPriority
                    ? `: ${getPriorityLabel(selectedPriority, t)}`
                    : ''}
                </span>

                {selectedPriority ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedPriority(null)
                      setSelectedIndex(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        setSelectedPriority(null)
                        setSelectedIndex(0)
                      }
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800"
                    aria-label={t('clearPriorityFilter')}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <ChevronDown className="h-3 w-3 opacity-60" />
                )}
              </button>

              {openFilterMenu === 'priority' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900 animate-in fade-in-50 zoom-in-95"
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {t('priority')}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedPriority(null)
                      setOpenFilterMenu(null)
                      setSelectedIndex(0)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span>{t('allPriorities')}</span>
                    {!selectedPriority && (
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    )}
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  {availablePriorities.map((pri) => (
                    <button
                      key={pri}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSelectedPriority(pri)
                        setOpenFilterMenu(null)
                        setSelectedIndex(0)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <span>{getPriorityLabel(pri, t)}</span>
                      {selectedPriority === pri && (
                        <Check className="h-3.5 w-3.5 text-primary-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Ward Filter */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t('filterByWard')}
                onClick={() =>
                  setOpenFilterMenu((prev) =>
                    prev === 'ward' ? null : 'ward'
                  )
                }
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                  selectedWard
                    ? 'bg-purple-100/90 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
                )}
              >
                <span>
                  {t('ward')}
                  {selectedWard ? `: ${selectedWard}` : ''}
                </span>

                {selectedWard ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedWard(null)
                      setSelectedIndex(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        setSelectedWard(null)
                        setSelectedIndex(0)
                      }
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-purple-200 dark:hover:bg-purple-800"
                    aria-label={t('clearWardFilter')}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <ChevronDown className="h-3 w-3 opacity-60" />
                )}
              </button>

              {openFilterMenu === 'ward' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 max-h-60 w-48 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900 animate-in fade-in-50 zoom-in-95"
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {t('municipalWards')}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedWard(null)
                      setOpenFilterMenu(null)
                      setSelectedIndex(0)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span>{t('allWards')}</span>
                    {!selectedWard && (
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    )}
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  {availableWards.map((w) => (
                    <button
                      key={w}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSelectedWard(w)
                        setOpenFilterMenu(null)
                        setSelectedIndex(0)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <span>{w}</span>
                      {selectedWard === w && (
                        <Check className="h-3.5 w-3.5 text-primary-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={t('filterByStatus')}
                onClick={() =>
                  setOpenFilterMenu((prev) =>
                    prev === 'status' ? null : 'status'
                  )
                }
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                  selectedStatus
                    ? 'bg-emerald-100/90 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-700'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700 dark:hover:bg-gray-700'
                )}
              >
                <span>
                  {t('status')}
                  {selectedStatus
                    ? `: ${getStatusLabel(selectedStatus, t)}`
                    : ''}
                </span>

                {selectedStatus ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedStatus(null)
                      setSelectedIndex(0)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        setSelectedStatus(null)
                        setSelectedIndex(0)
                      }
                    }}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-emerald-200 dark:hover:bg-emerald-800"
                    aria-label={t('clearStatusFilter')}
                  >
                    <X className="h-3 w-3" />
                  </span>
                ) : (
                  <ChevronDown className="h-3 w-3 opacity-60" />
                )}
              </button>

              {openFilterMenu === 'status' && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-800 dark:bg-gray-900 animate-in fade-in-50 zoom-in-95"
                >
                  <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {t('complaintStatus')}
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setSelectedStatus(null)
                      setOpenFilterMenu(null)
                      setSelectedIndex(0)
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <span>{t('allStatuses')}</span>
                    {!selectedStatus && (
                      <Check className="h-3.5 w-3.5 text-primary-600" />
                    )}
                  </button>

                  <div className="my-1 border-t border-gray-100 dark:border-gray-800" />

                  {availableStatuses.map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSelectedStatus(st)
                        setOpenFilterMenu(null)
                        setSelectedIndex(0)
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
                    >
                      <span>{getStatusLabel(st, t)}</span>
                      {selectedStatus === st && (
                        <Check className="h-3.5 w-3.5 text-primary-600" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Clear All Filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFiltersOnly}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors shrink-0"
                aria-label={t('clearAllFilters')}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t('clearFilters')}</span>
              </button>
            )}
          </div>

          {/* Results / Content Area */}
          <div
            ref={resultsContainerRef}
            className="max-h-[60vh] sm:max-h-[50vh] overflow-y-auto divide-y divide-gray-100 p-2 dark:divide-gray-800"
          >
            {/* Loading State */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin text-primary-600 dark:text-primary-400 mb-2" />
                <p className="text-xs font-medium">
                  {t('searchingReports')}
                </p>
              </div>
            )}

            {/* Error State */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-500 mb-2" />

                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t('failedToLoadReports')}
                </h4>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                  {t('spotlightLoadErrorDescription')}
                </p>

                <button
                  type="button"
                  onClick={retry}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t('retry')}</span>
                </button>
              </div>
            )}

            {/* Recent Searches */}
            {!loading && !error && isSearchEmpty && !hasActiveFilters && (
              <div>
                {recentSearches.length > 0 ? (
                  <div className="p-2">
                    <div className="flex items-center justify-between px-2 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        {t('recentSearches')}
                      </span>

                      <button
                        type="button"
                        onClick={handleClearHistory}
                        className="text-[11px] text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 transition-colors"
                        aria-label={t('clearRecentSearches')}
                      >
                        {t('clearHistory')}
                      </button>
                    </div>

                    <div className="space-y-1">
                      {recentSearches.map((term, index) => (
                        <div
                          key={term + index}
                          onClick={() => handleExecuteRecentSearch(term)}
                          className="group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium truncate">{term}</span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleRemoveRecent(e, term)}
                            className="rounded p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-gray-700 dark:hover:text-gray-200"
                            aria-label={`${t('removeRecentSearch')} ${term}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Clock className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-2" />

                    <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {t('noRecentSearches')}
                    </h4>

                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">
                      {t('spotlightRecentSearchDescription')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Filtered Results */}
            {!loading && !error && (!isSearchEmpty || hasActiveFilters) && (
              <>
                {filteredReports.length > 0 ? (
                  <div
                    role="listbox"
                    id="spotlight-results-list"
                    aria-label={t('searchResults')}
                    className="space-y-1 p-1"
                  >
                    {filteredReports.map((report, index) => {
                      const isSelected = index === selectedIndex
                      const priority = report.priority || 'Medium'
                      const priorityLower = priority.toLowerCase()

                      return (
                        <div
                          key={report.id || report.complaintId || index}
                          data-index={index}
                          role="option"
                          id={`spotlight-option-${index}`}
                          aria-selected={isSelected}
                          onClick={() => handleSelectReport(report)}
                          onMouseEnter={() => setSelectedIndex(index)}
                          className={cn(
                            'group flex cursor-pointer items-start gap-3 rounded-xl p-3 text-left transition-all',
                            isSelected
                              ? 'bg-primary-50/80 border border-primary-200 dark:bg-primary-950/40 dark:border-primary-800/80 shadow-xs'
                              : 'border border-transparent hover:bg-gray-50/80 dark:hover:bg-gray-800/60'
                          )}
                        >
                          <div className="shrink-0 mt-0.5">
                            {report.department ? (
                              <DepartmentCrest
                                department={report.department}
                                className="h-8 w-8"
                              />
                            ) : (
                              <CategoryAvatar
                                category={report.category}
                                className="h-8 w-8"
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              <span className="font-mono text-xs font-bold text-primary-600 dark:text-primary-400">
                                {getDisplayId(report)}
                              </span>

                              {report.status && (
                                <Badge
                                  variant={
                                    statusVariant[report.status] || 'secondary'
                                  }
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {getStatusLabel(report.status, t)}
                                </Badge>
                              )}

                              {report.priority && (
                                <Badge
                                  variant={
                                    priorityLower === 'critical' ||
                                    priorityLower === 'high'
                                      ? 'destructive'
                                      : priorityLower === 'medium'
                                        ? 'warning'
                                        : 'default'
                                  }
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {getPriorityLabel(report.priority, t)}
                                </Badge>
                              )}

                              {report.category && (
                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                                  {getCategoryLabel(report.category, t)}
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              <HighlightMatch
                                text={report.title}
                                query={searchQuery}
                              />
                            </h4>

                            {report.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                                <HighlightMatch
                                  text={report.description}
                                  query={searchQuery}
                                />
                              </p>
                            )}

                            {(report.ward || report.address || report.location) && (
                              <div className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                <MapPin className="h-3 w-3 shrink-0" />

                                <span className="truncate">
                                  {report.ward ? (
                                    <span className="font-medium text-gray-600 dark:text-gray-300 mr-1.5">
                                      {report.ward}
                                    </span>
                                  ) : null}

                                  {report.address || report.location}
                                </span>
                              </div>
                            )}
                          </div>

                          <div
                            className={cn(
                              'shrink-0 text-gray-400 dark:text-gray-500 self-center transition-opacity',
                              isSelected
                                ? 'opacity-100'
                                : 'opacity-0 sm:group-hover:opacity-100'
                            )}
                          >
                            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono shadow-xs">
                              ↵
                            </kbd>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 mb-3">
                      <Search className="h-6 w-6" />
                    </div>

                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {t('noMatchingReports')}
                    </h4>

                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                      {searchQuery
                        ? t('noReportsMatchingSearch').replace(
                            '{query}',
                            `"${searchQuery}"`
                          )
                        : t('noReportsMatchFilters')}
                      {' '}
                      {t('adjustSearchOrFilters')}
                    </p>

                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>{t('clearSearchAndFilters')}</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Modal Footer / Shortcuts Guide */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/80 px-4 py-2.5 text-[11px] text-gray-500 dark:border-gray-800 dark:bg-gray-950/80 dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1 py-0.2 font-mono text-[10px] text-gray-600 shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  ↑↓
                </kbd>
                <span>{t('navigate')}</span>
              </span>

              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1 py-0.2 font-mono text-[10px] text-gray-600 shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  ↵
                </kbd>
                <span>{t('select')}</span>
              </span>

              <span className="flex items-center gap-1">
                <kbd className="rounded border border-gray-300 bg-white px-1 py-0.2 font-mono text-[10px] text-gray-600 shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  esc
                </kbd>
                <span>{t('close')}</span>
              </span>
            </div>

            <div>
              {filteredReports.length > 0 && (
                <span className="font-medium text-gray-600 dark:text-gray-300">
                  {filteredReports.length}{' '}
                  {filteredReports.length === 1
                    ? t('report')
                    : t('reports')}
                </span>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default SpotlightSearchModal

