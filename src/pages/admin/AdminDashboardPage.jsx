import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flag, Shield, BarChart3, Users, Clock, ArrowRight, Star } from 'lucide-react'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const statusVariant = {
  Pending: 'destructive',
  'In Progress': 'warning',
  Resolved: 'success',
  Rejected: 'secondary',
  Reopened: 'warning',
}

export function AdminDashboardPage() {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const q = query(collection(db, 'issues'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setComplaints(list)
        setLoading(false)
      },
      (err) => {
        console.error('AdminDashboard Firestore error:', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  const stats = useMemo(() => {
    const total = complaints.length
    let pending = 0, inProgress = 0, resolved = 0
    let totalRating = 0, ratedCount = 0
    const uniqueUsers = new Set()
    for (const c of complaints) {
      if (c.status === 'Pending' || c.status === 'Reopened') pending++
      else if (c.status === 'In Progress') inProgress++
      else if (c.status === 'Resolved') resolved++
      if (c.reportedBy) uniqueUsers.add(c.reportedBy)
      if (c.feedback?.rating && typeof c.feedback.rating === 'number') {
        totalRating += c.feedback.rating
        ratedCount++
      }
    }
    const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : null
    return {
      total,
      pending,
      inProgress,
      resolved,
      activeCitizens: uniqueUsers.size,
      avgRating,
      ratedCount,
    }
  }, [complaints])

  const recentReports = complaints.slice(0, 5)

  const statCards = [
    { label: 'Total Complaints', value: stats.total, icon: Flag, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
    { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
    { label: 'In Progress', value: stats.inProgress, icon: BarChart3, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Resolved', value: stats.resolved, icon: Shield, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
  ]

  return (
    <div>
      <PageHeader
        title="Admin Dashboard"
        description="Overview of all civic reports"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {loading ? '-' : stat.value}
                  </p>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                  <stat.icon className="h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              </div>
            ) : recentReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Flag className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No reports submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentReports.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/reports/${r.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(r)}</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate mt-0.5">{r.title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {r.category} &middot; {r.createdAt?.toDate?.().toLocaleDateString() || '-'}
                      </p>
                    </div>
                    <Badge variant={statusVariant[r.status] || 'default'} className="shrink-0 ml-3 capitalize">{r.status}</Badge>
                  </div>
                ))}
                <Button variant="ghost" size="sm" className="w-full gap-2 text-primary-600" onClick={() => navigate('/admin/reports')}>
                  View All Reports <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-4">
                {[
                  { icon: Users, label: 'Active Citizens', desc: 'Unique complainants', value: stats.activeCitizens, bg: 'bg-gray-50 dark:bg-gray-800/50', iconColor: 'text-primary-600 dark:text-primary-400' },
                  { icon: Star, label: 'Citizen Satisfaction', desc: stats.ratedCount ? `${stats.ratedCount} review${stats.ratedCount === 1 ? '' : 's'}` : 'No ratings yet', value: stats.avgRating ? `${stats.avgRating} ★` : '-', bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-500 fill-amber-500' },
                  { icon: Clock, label: 'Pending', desc: 'Awaiting action', value: stats.pending, bg: 'bg-red-50 dark:bg-red-900/20', iconColor: 'text-red-600 dark:text-red-400' },
                  { icon: BarChart3, label: 'In Progress', desc: 'Being addressed', value: stats.inProgress, bg: 'bg-amber-50 dark:bg-amber-900/20', iconColor: 'text-amber-600 dark:text-amber-400' },
                  { icon: Shield, label: 'Resolved', desc: 'Completed', value: stats.resolved, bg: 'bg-emerald-50 dark:bg-emerald-900/20', iconColor: 'text-emerald-600 dark:text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className={`flex items-center justify-between p-4 rounded-lg ${s.bg}`}>
                    <div className="flex items-center gap-3">
                      <s.icon className={`h-5 w-5 ${s.iconColor}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{s.label}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{s.desc}</p>
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
