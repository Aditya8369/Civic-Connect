import { matchesComplaintSearch } from './complaintSearch'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Flag,
  LoaderCircle,
  Search,
  X,
} from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { getDisplayId } from '@/firebase/complaintId'
import {
  fetchAllReportsForExport,
  fetchAllReportsForSearch,
  REPORTS_PAGE_SIZE,
  subscribeToReportsPage,
} from '@/firebase/adminReportsQuery'
import { toCsv, downloadCsv, formatDateStamp } from '@/utils/csv'
import { PageHeader } from '@/components/common/PageHeader'
import { ComplaintCardSkeleton } from '@/components/common/ComplaintCardSkeleton'
import { ConnectionErrorBanner } from '@/components/common/ConnectionErrorBanner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SlaBadge } from '@/components/common/SlaBadge'
import { SlaEscalationBanner } from '@/components/admin/SlaEscalationBanner'
import { DepartmentCsatWidget } from '@/components/admin/DepartmentCsatWidget'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import { getSlaTargetDate, isSlaBreached } from '@/utils/sla'
import { BulkActionsToolbar } from '@/components/admin/BulkActionsToolbar'
import { useLanguage } from '@/contexts/LanguageContext'

const statusVariant = {
  Pending: 'destructive',
  'In Progress': 'warning',
  Resolved: 'success',
  Rejected: 'secondary',
  Reopened: 'warning',
  'Merged - Duplicate': 'secondary',
}

const statusTranslationKeys = {
  Pending: 'statusPending',
  'In Progress': 'statusInProgress',
  Resolved: 'statusResolved',
  Rejected: 'statusRejected',
  Reopened: 'statusReopened',
  'Merged - Duplicate': 'statusMerged',
}

const departmentTranslationKeys = {
  Roads: 'departmentRoads',
  Sanitation: 'departmentSanitation',
  Electricity: 'departmentElectricity',
  Water: 'departmentWater',
  'Public Safety': 'departmentPublicSafety',
}

const categoryTranslationKeys = {
  'Potholes & Road Damage': 'categoryRoadDamage',
  'Streetlight Issues': 'categoryStreetlightIssues',
  'Water Leakage': 'categoryWaterLeakage',
  'Garbage & Sanitation': 'categoryGarbageSanitation',
  'Noise Pollution': 'categoryNoisePollution',
  'Illegal Construction': 'categoryIllegalConstruction',
  'Traffic Issues': 'categoryTrafficIssues',
  Other: 'categoryOther',
}

function formatDate(ts, language) {
  if (!ts?.toDate) return ''

  return ts.toDate().toLocaleDateString(
    language === 'hi' ? 'hi-IN' : 'en-US',
    { month: 'short', day: 'numeric', year: 'numeric' }
  )
}

const csvHeaders = [
  'Tracking ID',
  'Title',
  'Category',
  'Department',
  'Status',
  'Address',
  'Created Date',
]

function toCsvRow(complaint, language) {
  return [
    getDisplayId(complaint),
    complaint.title || '',
    complaint.category || '',
    complaint.department || 'Not assigned',
    complaint.status || '',
    complaint.address || '',
    formatDate(complaint.createdAt, language),
  ]
}

const allCategories = [
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

const allDepartments = [
  'Roads',
  'Sanitation',
  'Electricity',
  'Water',
  'Public Safety',
]

function HighlightMatch({ text, query }) {
  if (!text) return null
  if (!query?.trim()) return text

  const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = String(text).split(new RegExp(`(${escapedQuery})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark
            key={index}
            className="rounded bg-yellow-200 text-gray-900 dark:bg-yellow-700 dark:text-white"
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

export function AdminReportsPage() {
  const { t, language } = useLanguage()

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const [statusFilter, setStatusFilter] = useState('all')
  const [slaFilter, setSlaFilter] = useState('all')
  const [showUrgentOnly, setShowUrgentOnly] = useState(false)
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const selectAllRef = useRef(null)
  const { user } = useAuth()
  const [userCache, setUserCache] = useState({})
  const cacheRef = useRef({})
  const pageCursorsRef = useRef([null])
  const lastCursorRef = useRef(null)
  const navigate = useNavigate()

  const fetchUsers = async (list) => {
    const uids = [...new Set(list.map((c) => c.reportedBy).filter(Boolean))]
    const cache = { ...cacheRef.current }
    const uncachedUids = uids.filter((uid) => !cache[uid])
    if (uncachedUids.length === 0) return cache

    let changed = false
    const CHUNK_SIZE = 25
    for (let i = 0; i < uncachedUids.length; i += CHUNK_SIZE) {
      const chunk = uncachedUids.slice(i, i + CHUNK_SIZE)
      await Promise.all(
        chunk.map(async (uid) => {
          changed = true
          try {
            const snap = await getDoc(doc(db, 'users', uid))
            cache[uid] = snap.exists()
              ? snap.data()
              : { name: 'Unknown User', email: null }
          } catch {
            cache[uid] = { name: 'Unknown User', email: null }
          }
        })
      )
    }
    if (changed) {
      cacheRef.current = cache
      setUserCache({ ...cache })
    }

    return cache
  }

  const serverFilters = {
    status: statusFilter,
    department: departmentFilter,
    category: categoryFilter,
    dateFrom,
    dateTo,
  }

  const resetPagination = () => {
    pageCursorsRef.current = [null]
    lastCursorRef.current = null
    setPageIndex(0)
    setHasMore(false)
    setSelectedIds([])
  }

  const changeFilter = (setter) => (value) => {
    setter(value)
    resetPagination()
  }

  useEffect(() => {
    if (!debouncedSearch) return undefined

    let cancelled = false
    setLoading(true)
    setLoadError(false)
    setPageIndex(0)

    Promise.resolve(fetchAllReportsForSearch(serverFilters))
      .then(async (result) => {
        if (cancelled) return
        const safeDocs = Array.isArray(result) ? result : (result?.docs || [])
        if (result?.truncated) {
          toast(`Search results capped at ${safeDocs.length} reports for performance.`)
        }
        setComplaints(safeDocs)
        setHasMore(false)
        setLoadError(false)
        setLoading(false)
        await fetchUsers(safeDocs)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('AdminReports search error:', err)
        setLoadError(true)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [statusFilter, departmentFilter, categoryFilter, dateFrom, dateTo, reloadKey, debouncedSearch])

  useEffect(() => {
    if (debouncedSearch) return undefined

    // `cancelled` is flipped by the cleanup, so a response for a previous filter/page
    // can never overwrite the results of a newer one.
    let cancelled = false
    setLoading(true)
    setLoadError(false)

    const unsub = subscribeToReportsPage(
      {
        status: statusFilter,
        department: departmentFilter,
        category: categoryFilter,
        dateFrom,
        dateTo,
        cursor: pageCursorsRef.current[pageIndex] ?? null,
      },
      {
        onPage: ({ docs, cursor, hasMore: more }) => {
          if (cancelled) return

          lastCursorRef.current = cursor
          setComplaints(docs)
          setHasMore(more)
          setLoadError(false)
          setLoading(false)
          fetchUsers(docs)
        },
        onOfflineEmpty: () => {
          if (cancelled) return

          if (!navigator.onLine) {
            setLoadError(true)
            setLoading(false)
          }
        },
        onError: (err) => {
          if (cancelled) return

          console.error('AdminReports Firestore error:', err)
          setLoadError(true)
          setLoading(false)
        },
      }
    )

    return () => {
      cancelled = true
      unsub()
    }
    // fetchUsers only touches refs/state setters, so it is intentionally not a dependency.
  }, [statusFilter, departmentFilter, categoryFilter, dateFrom, dateTo, pageIndex, reloadKey, debouncedSearch])

  const handleNextPage = () => {
    if (loading) return
    if (debouncedSearch) {
      if (!hasSearchNextPage) return
      setSelectedIds([])
      setPageIndex((index) => index + 1)
      return
    }
    if (!hasMore || !lastCursorRef.current) return
    pageCursorsRef.current = [...pageCursorsRef.current.slice(0, pageIndex + 1), lastCursorRef.current]
    setSelectedIds([])
    setPageIndex(pageIndex + 1)
  }

  const handlePreviousPage = () => {
    if (loading || pageIndex === 0) return

    setSelectedIds([])
    setPageIndex(pageIndex - 1)
  }

  // SLA and Urgent filters are evaluated client-side; search loads the complete
  // server-filtered result set before applying the same matcher.
  const matchesClientFilters = (c, users) => {
    if (slaFilter === 'breached' && !isSlaBreached(c)) return false

    if (showUrgentOnly) {
      const targetDate = getSlaTargetDate(c.createdAt, c.category, c.department)

      if (!targetDate) return false

      const remainingMs = targetDate.getTime() - Date.now()
      if (remainingMs > 2 * 60 * 60 * 1000) return false
    }

    return matchesComplaintSearch(c, debouncedSearch, users[c.reportedBy])
  }

  const filtered = complaints.filter((c) => matchesClientFilters(c, userCache))
  const visibleComplaints = debouncedSearch
    ? filtered.slice(pageIndex * REPORTS_PAGE_SIZE, (pageIndex + 1) * REPORTS_PAGE_SIZE)
    : filtered
  const hasSearchNextPage = debouncedSearch &&
    filtered.length > (pageIndex + 1) * REPORTS_PAGE_SIZE
  const canGoToNextPage = debouncedSearch ? hasSearchNextPage : hasMore

  const collectExportRows = async () => {
    const { docs, truncated } = await fetchAllReportsForExport(serverFilters)
    const users = debouncedSearch ? await fetchUsers(docs) : userCache

    if (truncated) {
      toast(
        t('reportsExportLimited').replace('{count}', String(docs.length))
      )
    }

    return docs.filter((c) => matchesClientFilters(c, users))
  }

  const handleExport = async () => {
    setExportingCsv(true)

    try {
      const rows = await collectExportRows()

      if (rows.length === 0) {
        toast(t('noReportsMatchFilters'))
        return
      }

      const csv = toCsv(csvHeaders, rows.map((row) => toCsvRow(row, language)))

      downloadCsv(`civic-reports-${formatDateStamp(new Date())}.csv`, csv)

      toast.success(
        t(rows.length === 1 ? 'reportsExportedSingular' : 'reportsExported')
          .replace('{count}', String(rows.length))
      )
    } catch (err) {
      console.error('CSV export failed:', err)
      toast.error(t('reportsCsvExportError'))
    } finally {
      setExportingCsv(false)
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)

    try {
      await new Promise((resolve) => setTimeout(resolve, 0))

      const rows = await collectExportRows()

      if (rows.length === 0) {
        toast(t('noReportsMatchFilters'))
        return
      }

      const { downloadComplaintsPdf } = await import('@/utils/pdfReport')

      downloadComplaintsPdf({
        complaints: rows,
        filters: {
          status: statusFilter,
          department: departmentFilter,
          category: categoryFilter,
          sla: slaFilter,
          search: debouncedSearch,
          dateFrom,
          dateTo,
        },
        now: new Date(),
      })

      toast.success(
        t('reportsPdfExported').replace('{count}', String(rows.length))
      )
    } catch (err) {
      console.error('PDF export failed:', err)
      toast.error(t('reportsPdfExportError'))
    } finally {
      setExportingPdf(false)
    }
  }

  const isAllSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id))

  const isIndeterminate = useMemo(() => {
    const selectedCount = filtered.filter((c) => selectedIds.includes(c.id)).length
    return selectedCount > 0 && selectedCount < filtered.length
  }, [filtered, selectedIds])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredIdSet = new Set(filtered.map((c) => c.id))
      setSelectedIds((prev) => prev.filter((id) => !filteredIdSet.has(id)))
    } else {
      const ids = filtered.map((c) => c.id)
      setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])))
    }
  }

  const handleToggleSelect = (id, e) => {
    e.stopPropagation()

    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    )
  }

  const suggestions = searchQuery.trim()
    ? complaints
        .filter((c) => {
          const q = searchQuery.trim().toLowerCase()

          return (
            getDisplayId(c).toLowerCase().includes(q) ||
            (c.title || '').toLowerCase().includes(q) ||
            (c.category || '').toLowerCase().includes(q)
          )
        })
        .slice(0, 5)
    : []

  return (
    <div>
      <PageHeader
        title={t('manageReports')}
        description={t('manageReportsDescription')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={
                loading ||
                complaints.length === 0 ||
                exportingCsv ||
                exportingPdf
              }
              aria-busy={exportingCsv}
            >
              {exportingCsv ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              {t('exportToCsv')}
            </Button>

            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={
                loading ||
                complaints.length === 0 ||
                exportingPdf ||
                exportingCsv
              }
              aria-busy={exportingPdf}
            >
              {exportingPdf ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FileText />
              )}
              {exportingPdf ? t('generatingPdf') : t('exportPdf')}
            </Button>
          </div>
        }
      />

      <SlaEscalationBanner
        complaints={complaints}
        onShowUrgentTickets={() => setShowUrgentOnly(true)}
      />

      <DepartmentCsatWidget
        complaints={complaints}
        onSelectDepartment={(dept) => {
          setDepartmentFilter(dept)
          setPageIndex(0)
        }}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

          <Input
            className="pl-9 pr-9"
            placeholder={t('adminReportsSearchPlaceholder')}
            value={searchQuery}
            role="combobox"
            aria-label={t('searchComplaints')}
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-autocomplete="list"
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSuggestions(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowSuggestions(false)
              if (e.key === 'Enter') setShowSuggestions(false)
            }}
          />

          {searchQuery && (
            <button
              type="button"
              aria-label={t('clearSearch')}
              onClick={() => {
                setSearchQuery('')
                setDebouncedSearch('')
                setShowSuggestions(false)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {showSuggestions && searchQuery.trim() && suggestions.length > 0 && (
            <div
              role="listbox"
              className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900"
            >
              {suggestions.map((complaint) => (
                <button
                  key={complaint.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  className="flex w-full flex-col items-start gap-1 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800"
                  onClick={() => {
                    setSearchQuery(getDisplayId(complaint))
                    setShowSuggestions(false)
                  }}
                >
                  <span className="text-xs font-semibold text-primary-600">
                    <HighlightMatch
                      text={getDisplayId(complaint)}
                      query={searchQuery}
                    />
                  </span>

                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    <HighlightMatch
                      text={complaint.title}
                      query={searchQuery}
                    />
                  </span>

                  <span className="text-xs text-gray-500">
                    <HighlightMatch
                      text={complaint.category}
                      query={searchQuery}
                    />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Select
          value={statusFilter}
          onValueChange={changeFilter(setStatusFilter)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t('allStatus')} />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">{t('allStatus')}</SelectItem>
            <SelectItem value="pending">{t('statusPending')}</SelectItem>
            <SelectItem value="in-progress">{t('statusInProgress')}</SelectItem>
            <SelectItem value="resolved">{t('statusResolved')}</SelectItem>
            <SelectItem value="rejected">{t('statusRejected')}</SelectItem>
            <SelectItem value="reopened">{t('statusReopened')}</SelectItem>
            <SelectItem value="merged - duplicate">{t('statusMerged')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={departmentFilter}
          onValueChange={changeFilter(setDepartmentFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder={t('allDepartments')} />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">{t('allDepartments')}</SelectItem>

            {allDepartments.map((department) => (
              <SelectItem key={department} value={department}>
                <div className="flex items-center gap-1.5">
                  <DepartmentCrest
                    department={department}
                    variant="avatar"
                    size="xs"
                  />
                  <span>
                    {t(departmentTranslationKeys[department] || department)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={changeFilter(setCategoryFilter)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('allCategories')} />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">{t('allCategories')}</SelectItem>

            {allCategories.map((category) => (
              <SelectItem key={category} value={category}>
                {t(categoryTranslationKeys[category] || category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-40"
          aria-label={t('fromDate')}
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => changeFilter(setDateFrom)(e.target.value)}
        />

        <Input
          type="date"
          className="w-40"
          aria-label={t('toDate')}
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => changeFilter(setDateTo)(e.target.value)}
        />

        <Select value={slaFilter} onValueChange={setSlaFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t('allSla')} />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">{t('allSla')}</SelectItem>
            <SelectItem value="breached">{t('breachedSla')}</SelectItem>
          </SelectContent>
        </Select>

        {showUrgentOnly && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setShowUrgentOnly(false)}
            className="gap-1.5"
          >
            {t('urgentOnly')}
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!loadError && !loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 py-2 mb-3 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label={t('selectAllComplaints')}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              checked={isAllSelected}
              ref={selectAllRef}
              onChange={handleToggleSelectAll}
            />

            <span className="font-medium text-gray-700 dark:text-gray-300">
              {t('selectAllCount').replace('{count}', String(filtered.length))}
            </span>
          </label>

          {selectedIds.length > 0 && (
            <span className="font-medium text-primary-600 dark:text-primary-400">
              {t('selectedCount').replace('{count}', String(selectedIds.length))}
            </span>
          )}
        </div>
      )}

      {loadError ? (
        <ConnectionErrorBanner onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
        >
          {Array.from({ length: 6 }, (_, i) => (
            <ComplaintCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Flag className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />

            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {searchQuery ||
              statusFilter !== 'all' ||
              departmentFilter !== 'all' ||
              categoryFilter !== 'all' ||
              slaFilter !== 'all' ||
              showUrgentOnly ||
              dateFrom ||
              dateTo
                ? t('noMatchingReportsFound')
                : t('noReportsFound')}
            </p>

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('reportsWillAppearHere')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleComplaints.map((complaint) => {
            const reportedUser = userCache[complaint.reportedBy]
            const isSelected = selectedIds.includes(complaint.id)

            return (
              <Card
                key={complaint.id}
                className={`cursor-pointer hover:shadow-md transition-all ${
                  isSelected
                    ? 'border-primary-500 ring-2 ring-primary-500/20 bg-primary-50/20 dark:bg-primary-950/20'
                    : ''
                }`}
                onClick={() => navigate(`/admin/reports/${complaint.id}`)}
              >
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start gap-2 mb-3">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        aria-label={t('selectComplaint').replace(
                          '{id}',
                          getDisplayId(complaint)
                        )}
                        className="h-4 w-4 mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer shrink-0"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleToggleSelect(complaint.id, e)}
                      />

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-mono text-primary-600 dark:text-primary-400 font-semibold mb-1">
                          <HighlightMatch
                            text={getDisplayId(complaint)}
                            query={debouncedSearch}
                          />
                        </p>

                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          <HighlightMatch
                            text={complaint.title}
                            query={debouncedSearch}
                          />
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      <SlaBadge
                        complaint={complaint}
                        className="whitespace-nowrap"
                      />

                      <Badge
                        variant={statusVariant[complaint.status] || 'default'}
                        className="capitalize whitespace-nowrap"
                      >
                        {t(statusTranslationKeys[complaint.status] || complaint.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <p>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {t('reportedBy')}:
                      </span>{' '}
                      {reportedUser?.name || t('unknownUser')}
                    </p>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <DepartmentCrest
                        department={complaint.department}
                        category={complaint.category}
                        size="xs"
                      />

                      {complaint.category && (
                        <CategoryAvatar
                          category={complaint.category}
                          size="xs"
                        />
                      )}
                    </div>

                    <p>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {t('departmentLabel')}:
                      </span>{' '}
                      {complaint.department
                        ? t(departmentTranslationKeys[complaint.department] || complaint.department)
                        : t('notAssigned')}
                    </p>

                    <p>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {t('categoryLabel')}:
                      </span>{' '}
                      <HighlightMatch
                        text={
                          complaint.category
                            ? t(categoryTranslationKeys[complaint.category] || complaint.category)
                            : '-'
                        }
                        query={debouncedSearch}
                      />
                    </p>

                    <p className="truncate">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {t('address')}:
                      </span>{' '}
                      {complaint.address}
                    </p>

                    <p>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {t('date')}:
                      </span>{' '}
                      {formatDate(complaint.createdAt, language) || '-'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loadError && (pageIndex > 0 || canGoToNextPage || complaints.length > 0) && (
        <nav
          aria-label={t('reportsPagination')}
          className="mt-6 flex flex-wrap items-center justify-between gap-3"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite">
            Page {pageIndex + 1}
            {!loading && ` · ${debouncedSearch ? filtered.length : complaints.length} report${(debouncedSearch ? filtered.length : complaints.length) === 1 ? '' : 's'}`}
          </p>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={loading || pageIndex === 0}
              aria-label={t('previousPage')}
            >
              <ChevronLeft />
              {t('previous')}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={loading || !canGoToNextPage}
              aria-label="Next page"
            >
              {t('next')}
              <ChevronRight />
            </Button>
          </div>
        </nav>
      )}

      <BulkActionsToolbar
        selectedIds={selectedIds}
        complaints={complaints}
        onClearSelection={() => setSelectedIds([])}
        onSelectionChange={setSelectedIds}
        actorUid={user?.uid}
      />
    </div>
  )
}