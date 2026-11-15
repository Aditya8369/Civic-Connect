
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Flag,
  Shield,
  BarChart3,
  Users,
  Clock,
  ArrowRight,
  Star,
  AlertTriangle,
} from 'lucide-react'
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { getDisplayId } from '@/firebase/complaintId'
import {
  DASHBOARD_WINDOW_SIZE,
  startDashboardAggregates,
} from '@/firebase/dashboardStats'
import { isSlaBreached } from '@/utils/sla'
import { SlaBadge } from '@/components/common/SlaBadge'
import {
  DepartmentCrest,
  CategoryAvatar,
} from '@/components/common/DepartmentCrest'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BulkActionsToolbar } from '@/components/admin/BulkActionsToolbar'
import { DepartmentWorkloadMonitor } from '@/components/admin/DepartmentWorkloadMonitor'

const ComplaintsMap = lazy(() =>
  import('@/components/common/ComplaintsMap').then((m) => ({
    default: m.ComplaintsMap,
  }))
)

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

export function AdminDashboardPage() {
  const { t, language } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [aggregates, setAggregates] = useState(null)
  const [aggregatesFailed, setAggregatesFailed] = useState(false)
  const [slaFilter, setSlaFilter] = useState('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedIds, setSelectedIds] = useState([])
  const selectAllRef = useRef(null)

  useEffect(() => {
    const aggregatesJob = startDashboardAggregates({
      onData: (data) => {
        setAggregates(data)
        setAggregatesFailed(false)
      },
      onError: (err) => {
        console.error('AdminDashboard aggregate error:', err)
        setAggregatesFailed(true)
      },
    })

    const q = query(
      collection(db, 'issues'),
      orderBy('createdAt', 'desc'),
      limit(DASHBOARD_WINDOW_SIZE)
    )

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setComplaints(list)
        setLoading(false)
        aggregatesJob.refresh()
      },
      (err) => {
        console.error('AdminDashboard Firestore error:', err)
        setLoading(false)
      }
    )

    return () => {
      unsub()
      aggregatesJob.stop()
    }
  }, [])

  const stats = useMemo(() => {
    const total = complaints.length
    let pending = 0
    let inProgress = 0
    let resolved = 0
    let breached = 0
    let totalRating = 0
    let ratedCount = 0

    const uniqueUsers = new Set()

    for (const c of complaints) {
      if (c.status === 'Pending' || c.status === 'Reopened') {
        pending++
      } else if (c.status === 'In Progress') {
        inProgress++
      } else if (c.status === 'Resolved') {
        resolved++
      }

      if (isSlaBreached(c)) breached++
      if (c.reportedBy) uniqueUsers.add(c.reportedBy)

      if (c.feedback?.rating && typeof c.feedback.rating === 'number') {
        totalRating += c.feedback.rating
        ratedCount++
      }
    }

    const avgRating =
      ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : null

    const windowed = {
      total,
      pending,
      inProgress,
      resolved,
      breached,
      activeCitizens: uniqueUsers.size,
      avgRating,
      ratedCount,
    }

    if (!aggregates) return windowed

    return {
      ...windowed,
      total: aggregates.total,
      pending: aggregates.pending,
      inProgress: aggregates.inProgress,
      resolved: aggregates.resolved,
      ratedCount: aggregates.ratedCount,
      avgRating:
        aggregates.avgRating != null
          ? aggregates.avgRating.toFixed(1)
          : null,
    }
  }, [complaints, aggregates])

  const statsLoading = loading || (!aggregates && !aggregatesFailed)

  const filteredReports = useMemo(() => {
    if (slaFilter === 'breached') {
      return complaints.filter((c) => isSlaBreached(c))
    }
    return complaints
  }, [complaints, slaFilter])

  const recentReports = filteredReports.slice(0, 5)
  const displayedComplaints = recentReports

  const isAllSelected = useMemo(() => {
    if (displayedComplaints.length === 0) return false

    return displayedComplaints.every((r) =>
      selectedIds.includes(r.id)
    )
  }, [displayedComplaints, selectedIds])

  const isIndeterminate = useMemo(() => {
    const count = displayedComplaints.filter((r) =>
      selectedIds.includes(r.id)
    ).length

    return count > 0 && count < displayedComplaints.length
  }, [displayedComplaints, selectedIds])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const displayedIdSet = new Set(
        displayedComplaints.map((r) => r.id)
      )

      setSelectedIds((prev) =>
        prev.filter((id) => !displayedIdSet.has(id))
      )
    } else {
      const ids = displayedComplaints.map((r) => r.id)

      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...ids]))
      )
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

  const statCards = [
    {
      label: t('totalComplaints'),
      value: stats.total,
      icon: Flag,
      color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30',
    },
    {
      label: t('statusPending'),
      value: stats.pending,
      icon: Clock,
      color: 'text-red-600 bg-red-50 dark:bg-red-900/30',
    },
    {
      label: t('statusInProgress'),
      value: stats.inProgress,
      icon: BarChart3,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
    },
    {
      label: t('statusResolved'),
      value: stats.resolved,
      icon: Shield,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30',
    },
  ]

  const quickStats = [
    {
      icon: Users,
      label: t('activeCitizens'),
      desc: t('uniqueComplainants').replace(
        '{count}',
        String(DASHBOARD_WINDOW_SIZE)
      ),
      value: stats.activeCitizens,
      bg: 'bg-gray-50 dark:bg-gray-800/50',
      iconColor: 'text-primary-600 dark:text-primary-400',
    },
    {
      icon: Star,
      label: t('citizenSatisfaction'),
      desc: stats.ratedCount
        ? t('reviewCount').replace(
            '{count}',
            String(stats.ratedCount)
          )
        : t('noRatingsYet'),
      value: stats.avgRating ? `${stats.avgRating} ★` : '-',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-500 fill-amber-500',
    },
    {
      icon: AlertTriangle,
      label: t('breachedSla'),
      desc: t('breachedSlaDescription').replace(
        '{count}',
        String(DASHBOARD_WINDOW_SIZE)
      ),
      value: stats.breached,
      bg:
        stats.breached > 0
          ? 'bg-red-50 dark:bg-red-900/20'
          : 'bg-gray-50 dark:bg-gray-800/50',
      iconColor:
        stats.breached > 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-gray-400',
      onClick: () =>
        setSlaFilter((prev) =>
          prev === 'breached' ? 'all' : 'breached'
        ),
    },
    {
      icon: Clock,
      label: t('statusPending'),
      desc: t('awaitingAction'),
      value: stats.pending,
      bg: 'bg-red-50 dark:bg-red-900/20',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      icon: BarChart3,
      label: t('statusInProgress'),
      desc: t('beingAddressed'),
      value: stats.inProgress,
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      icon: Shield,
      label: t('statusResolved'),
      desc: t('completed'),
      value: stats.resolved,
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  const dateLocale = language === 'hi' ? 'hi-IN' : 'en-US'

  return (
    <div>
      <PageHeader
        title={t('adminDashboard')}
        description={t('adminDashboardDescription')}
      />

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          {t('overview')}
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`py-2 px-4 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'map'
              ? 'border-primary-600 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
          }`}
        >
          {t('gisMap')}
        </button>
      </div>

      {activeTab === 'map' ? (
        <Suspense
          fallback={
            <div className="h-96 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-500">
              {t('loadingMap')}
            </div>
          }
        >
          <ComplaintsMap complaints={complaints} isAdmin={true} />
        </Suspense>
      ) : (
        <>
          {aggregatesFailed && !aggregates && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
            >
              {t('dashboardAggregateError')
                .replace('{count}', String(DASHBOARD_WINDOW_SIZE))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {statCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {stat.label}
                      </p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                        {statsLoading ? '-' : stat.value}
                      </p>
                    </div>

                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}
                    >
                      <stat.icon className="h-6 w-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <DepartmentWorkloadMonitor
            complaints={complaints}
            workload={aggregates?.workload}
            loading={statsLoading}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4">
                <CardTitle>{t('recentReports')}</CardTitle>

                <div
                  className="flex items-center gap-1.5"
                  role="group"
                  aria-label={t('filterReportsBySla')}
                >
                  <Button
                    variant={slaFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => setSlaFilter('all')}
                  >
                    {t('all')}
                  </Button>

                  <Button
                    variant={slaFilter === 'breached' ? 'destructive' : 'outline'}
                    size="sm"
                    className="h-7 text-xs px-2.5 gap-1"
                    onClick={() => setSlaFilter('breached')}
                  >
                    {t('breachedSla')}
                    {stats.breached > 0 && (
                      <span className="ml-1 rounded-full bg-red-600/20 dark:bg-red-400/20 px-1.5 py-0.2 text-[10px] font-semibold">
                        {stats.breached}
                      </span>
                    )}
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                  </div>
                ) : recentReports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Flag className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {slaFilter === 'breached'
                        ? t('noReportsBreachedSla')
                        : t('noReportsSubmitted')}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 mb-1 border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          aria-label={t('selectAllComplaints')}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                          checked={isAllSelected}
                          ref={selectAllRef}
                          onChange={handleToggleSelectAll}
                        />
                        <span>
                          {t('selectAllCount').replace(
                            '{count}',
                            String(displayedComplaints.length)
                          )}
                        </span>
                      </label>

                      {selectedIds.length > 0 && (
                        <span className="font-medium text-primary-600 dark:text-primary-400">
                          {t('bulkSelected').replace(
                            '{count}',
                            String(selectedIds.length)
                          )}
                        </span>
                      )}
                    </div>

                    {recentReports.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedIds.includes(r.id)
                            ? 'border-primary-500 bg-primary-50/40 dark:bg-primary-950/30'
                            : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                        }`}
                        onClick={() => navigate(`/admin/reports/${r.id}`)}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            aria-label={t('selectComplaint').replace(
                              '{id}',
                              getDisplayId(r)
                            )}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer shrink-0"
                            checked={selectedIds.includes(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => handleToggleSelect(r.id, e)}
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
                              {getDisplayId(r)}
                            </p>

                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate mt-0.5">
                              {r.title}
                            </p>

                            <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <DepartmentCrest
                                department={r.department}
                                category={r.category}
                                size="xs"
                                variant="chip"
                              />

                              {r.category && (
                                <CategoryAvatar
                                  category={r.category}
                                  size="xs"
                                />
                              )}

                              <span>
                                &middot;{' '}
                                {r.createdAt?.toDate?.().toLocaleDateString(
                                  dateLocale
                                ) || '-'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 ml-3 justify-end">
                          <SlaBadge complaint={r} />

                          <Badge
                            variant={statusVariant[r.status] || 'default'}
                            className="capitalize"
                          >
                            {statusTranslationKeys[r.status]
                              ? t(statusTranslationKeys[r.status])
                              : r.status}
                          </Badge>
                        </div>
                      </div>
                    ))}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2 text-primary-600"
                      onClick={() => navigate('/admin/reports')}
                    >
                      {t('viewAllReports')}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('quickStats')}</CardTitle>
              </CardHeader>

              <CardContent>
                {statsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {quickStats.map((s) => (
                      <div
                        key={s.label}
                        className={`flex items-center justify-between p-4 rounded-lg ${s.bg} ${
                          s.onClick
                            ? 'cursor-pointer hover:opacity-90 transition-opacity'
                            : ''
                        }`}
                        onClick={s.onClick}
                      >
                        <div className="flex items-center gap-3">
                          <s.icon className={`h-5 w-5 ${s.iconColor}`} />

                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {s.label}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {s.desc}
                            </p>
                          </div>
                        </div>

                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
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
