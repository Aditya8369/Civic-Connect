import { matchesComplaintSearch } from './complaintSearch'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, FileText, Flag, LoaderCircle, Search, X } from 'lucide-react'
import { collection, query, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { getDisplayId } from '@/firebase/complaintId'
import { isUnconfirmedEmpty } from '@/firebase/snapshot'
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
<<<<<<< HEAD
import { getSlaTargetDate, isSlaBreached } from '@/utils/sla'
=======
import { isSlaBreached } from '@/utils/sla'
import { matchesDateRange } from '@/utils/dateRange'
>>>>>>> upstream/main
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

const csvHeaders = [
  'Complaint ID',
  'Date',
  'Title',
  'Category',
  'Department',
  'Status',
  'Address',
  'Assigned Worker Name',
  'Assigned Worker Phone',
]

function toCsvRow(c) {
  return [
    getDisplayId(c),
    c.createdAt?.toDate ? formatDateStamp(c.createdAt.toDate()) : '',
    c.title,
    c.category,
    c.department,
    c.status,
    c.address,
    c.assignedWorker?.name,
    c.assignedWorker?.phone,
  ]
}
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
  }

  useEffect(() => {
    setLoading(true)
    setLoadError(false)
    const q = query(collection(db, 'issues'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (isUnconfirmedEmpty(snapshot)) {
          if (!navigator.onLine) {
            setLoadError(true)
            setLoading(false)
          }
          return
        }
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setComplaints(list)
        setLoadError(false)
        setLoading(false)
        fetchUsers(list)
      },
      (err) => {
        console.error('AdminReports Firestore error:', err)
        setLoadError(true)
        setLoading(false)
      }
    )
    return unsub
  }, [reloadKey])

const filtered = complaints.filter((c) => {
  if (statusFilter !== 'all') {
    const val = statusFilter === 'in-progress' ? 'in progress' : statusFilter
    if (c.status?.toLowerCase() !== val) return false
  }

  if (slaFilter === 'breached' && !isSlaBreached(c)) return false
if (showUrgentOnly) {
  const targetDate = getSlaTargetDate(
    c.createdAt,
    c.category,
    c.department
  )

  if (!targetDate) return false

  const remainingMs = targetDate.getTime() - Date.now()

  if (remainingMs > 2 * 60 * 60 * 1000) return false
}

  if (departmentFilter !== 'all' && c.department !== departmentFilter) {
    return false
  }

  if (categoryFilter !== 'all' && c.category !== categoryFilter) {
    return false
  }

  if (!matchesDateRange(c, dateFrom, dateTo)) {
    return false
  }

  if (!matchesComplaintSearch(c, debouncedSearch, userCache[c.reportedBy])) {
    return false
  }

  return true
})
 const handleExport = () => {
    const csv = toCsv(csvHeaders, filtered.map(toCsvRow))
    downloadCsv(`civic-reports-${formatDateStamp(new Date())}.csv`, csv)
    toast.success(`Exported ${filtered.length} report${filtered.length === 1 ? '' : 's'}`)
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      // Let the spinner paint before the synchronous PDF build starts, and only load jsPDF when it is needed.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const { downloadComplaintsPdf } = await import('@/utils/pdfReport')
      downloadComplaintsPdf({
        complaints: filtered,
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
      toast.success(`Exported ${filtered.length} report${filtered.length === 1 ? '' : 's'} to PDF`)
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
            <Button variant="outline" onClick={handleExport} disabled={loading || filtered.length === 0}>
              <Download />
              Export to CSV
            </Button>
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={loading || filtered.length === 0 || exportingPdf}
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
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

        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
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

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
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
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          type="date"
          className="w-40"
          aria-label="To date"
          value={dateTo}
          min={dateFrom || undefined}
          onChange={(e) => setDateTo(e.target.value)}
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
              {searchQuery || statusFilter !== 'all' || departmentFilter !== 'all' || categoryFilter !== 'all' || slaFilter !== 'all' || dateFrom || dateTo
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
          {filtered.map((complaint) => {
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
