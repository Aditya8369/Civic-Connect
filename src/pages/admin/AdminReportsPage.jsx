import { matchesComplaintSearch } from './complaintSearch'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, FileText, Flag, LoaderCircle, Search, X } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SlaBadge } from '@/components/common/SlaBadge'
import { SlaEscalationBanner } from '@/components/admin/SlaEscalationBanner'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import { getSlaTargetDate, isSlaBreached } from '@/utils/sla'
import { BulkActionsToolbar } from '@/components/admin/BulkActionsToolbar'

const statusVariant = {
  Pending: 'destructive',
  'In Progress': 'warning',
  Resolved: 'success',
  Rejected: 'secondary',
  Reopened: 'warning',
  'Merged - Duplicate': 'secondary',
}

function formatDate(ts) {
  if (!ts?.toDate) return ''
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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

function toCsvRow(complaint) {
  return [
    getDisplayId(complaint),
    complaint.title || '',
    complaint.category || '',
    complaint.department || 'Not assigned',
    complaint.status || '',
    complaint.address || '',
    formatDate(complaint.createdAt),
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

const allDepartments = ['Roads', 'Sanitation', 'Electricity', 'Water', 'Public Safety']

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
  // pageCursorsRef.current[n] is the startAfter() cursor used to load page n (page 0 has none).
  const pageCursorsRef = useRef([null])
  // Last displayed document of the page currently on screen; becomes the next page's cursor.
  const lastCursorRef = useRef(null)
  const navigate = useNavigate()

  const fetchUsers = async (list) => {
    const uids = [...new Set(list.map((c) => c.reportedBy).filter(Boolean))]
    const cache = { ...cacheRef.current }
    let changed = false
    await Promise.all(
      uids.map(async (uid) => {
        if (cache[uid]) return
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
    if (changed) {
      cacheRef.current = cache
      setUserCache({ ...cache })
    }
    return cache
  }

  // Server-side filters. Changing any of them (via changeFilter -> resetPagination)
  // returns to page 1 and drops every stored cursor, so a cursor that belongs to an
  // old filter is never reused.
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

    fetchAllReportsForSearch(serverFilters)
      .then(async (docs) => {
        if (cancelled) return
        setComplaints(docs)
        setHasMore(false)
        setLoadError(false)
        setLoading(false)
        await fetchUsers(docs)
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

  // Exports cover every report matching the filters, not just the visible page.
  const collectExportRows = async () => {
    const { docs, truncated } = await fetchAllReportsForExport(serverFilters)
    const users = debouncedSearch ? await fetchUsers(docs) : userCache
    if (truncated) {
      toast(`Export limited to the ${docs.length} most recent matching reports.`)
    }
    return docs.filter((c) => matchesClientFilters(c, users))
  }

  const handleExport = async () => {
    setExportingCsv(true)
    try {
      const rows = await collectExportRows()
      if (rows.length === 0) {
        toast('No reports match the current filters')
        return
      }
      const csv = toCsv(csvHeaders, rows.map(toCsvRow))
      downloadCsv(`civic-reports-${formatDateStamp(new Date())}.csv`, csv)
      toast.success(`Exported ${rows.length} report${rows.length === 1 ? '' : 's'}`)
    } catch (err) {
      console.error('CSV export failed:', err)
      toast.error('Could not export reports. Please try again.')
    } finally {
      setExportingCsv(false)
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      // Let the spinner paint before the synchronous PDF build starts, and only load jsPDF when it is needed.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const rows = await collectExportRows()
      if (rows.length === 0) {
        toast('No reports match the current filters')
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
      toast.success(`Exported ${rows.length} report${rows.length === 1 ? '' : 's'} to PDF`)
    } catch (err) {
      console.error('PDF export failed:', err)
      toast.error('Could not generate the PDF. Please try again.')
    } finally {
      setExportingPdf(false)
    }
  }

  const isAllSelected = filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id))
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
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
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
        title="Manage Reports"
        description="Review and manage all citizen reports"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={loading || complaints.length === 0 || exportingCsv || exportingPdf}
              aria-busy={exportingCsv}
            >
              {exportingCsv ? <LoaderCircle className="animate-spin" /> : <Download />}
              Export to CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={loading || complaints.length === 0 || exportingPdf || exportingCsv}
              aria-busy={exportingPdf}
            >
              {exportingPdf ? <LoaderCircle className="animate-spin" /> : <FileText />}
              {exportingPdf ? 'Generating PDF...' : 'Export PDF'}
            </Button>
          </div>
        }
      />
      <SlaEscalationBanner
        complaints={complaints}
        onShowUrgentTickets={() => setShowUrgentOnly(true)}
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

          <Input
            className="pl-9 pr-9"
            placeholder="Search by tracking ID, title, or category..."
            value={searchQuery}
            role="combobox"
            aria-label="Search complaints"
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
              aria-label="Clear search"
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
                    <HighlightMatch text={getDisplayId(complaint)} query={searchQuery} />
                  </span>
                  <span className="text-sm text-gray-800 dark:text-gray-200">
                    <HighlightMatch text={complaint.title} query={searchQuery} />
                  </span>
                  <span className="text-xs text-gray-500">
                    <HighlightMatch text={complaint.category} query={searchQuery} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <Select value={statusFilter} onValueChange={changeFilter(setStatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="reopened">Reopened</SelectItem>
            <SelectItem value="merged - duplicate">Merged - Duplicate</SelectItem>
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={changeFilter(setDepartmentFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {allDepartments.map((d) => (
              <SelectItem key={d} value={d}>
                <div className="flex items-center gap-1.5">
                  <DepartmentCrest department={d} variant="avatar" size="xs" />
                  <span>{d}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={changeFilter(setCategoryFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {allCategories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          className="w-40"
          aria-label="From date"
          value={dateFrom}
          max={dateTo || undefined}
          onChange={(e) => changeFilter(setDateFrom)(e.target.value)}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="To date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => changeFilter(setDateTo)(e.target.value)}
        />

        <Select value={slaFilter} onValueChange={setSlaFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All SLA" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All SLA</SelectItem>
            <SelectItem value="breached">Breached SLA</SelectItem>
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
            Urgent Only (≤2h)
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {!loadError && !loading && filtered.length > 0 && (
        <div className="flex items-center justify-between px-1 py-2 mb-3 text-xs text-gray-500 border-b border-gray-100 dark:border-gray-800">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              aria-label="Select all complaints"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              checked={isAllSelected}
              ref={selectAllRef}
              onChange={handleToggleSelectAll}
            />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Select All ({filtered.length})
            </span>
          </label>
          {selectedIds.length > 0 && (
            <span className="font-medium text-primary-600 dark:text-primary-400">
              {selectedIds.length} selected
            </span>
          )}
        </div>
      )}

      {loadError ? (
        <ConnectionErrorBanner onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => <ComplaintCardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Flag className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">
              {searchQuery || statusFilter !== 'all' || departmentFilter !== 'all' || categoryFilter !== 'all' || slaFilter !== 'all' || showUrgentOnly || dateFrom || dateTo
                ? 'No matching reports found'
                : 'No reports found'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Reports submitted by citizens will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleComplaints.map((complaint) => {
            const user = userCache[complaint.reportedBy]
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
                        aria-label={`Select complaint ${getDisplayId(complaint)}`}
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
                          <HighlightMatch text={complaint.title} query={debouncedSearch} />
                        </h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      <SlaBadge complaint={complaint} className="whitespace-nowrap" />
                      <Badge variant={statusVariant[complaint.status] || 'default'} className="capitalize whitespace-nowrap">
                        {complaint.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">Reported By:</span> {user?.name || 'Unknown User'}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <DepartmentCrest department={complaint.department} category={complaint.category} size="xs" />
                      {complaint.category && <CategoryAvatar category={complaint.category} size="xs" />}
                    </div>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">Department:</span> {complaint.department || 'Not assigned'}</p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">Category:</span> <HighlightMatch
                      text={complaint.category || '-'}
                      query={debouncedSearch}
                    /></p>
                    <p className="truncate"><span className="font-medium text-gray-700 dark:text-gray-300">Address:</span> {complaint.address}</p>
                    <p><span className="font-medium text-gray-700 dark:text-gray-300">Date:</span> {formatDate(complaint.createdAt) || '-'}</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {!loadError && (pageIndex > 0 || canGoToNextPage || complaints.length > 0) && (
        <nav
          aria-label="Reports pagination"
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
              aria-label="Previous page"
            >
              <ChevronLeft />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={loading || !canGoToNextPage}
              aria-label="Next page"
            >
              Next
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