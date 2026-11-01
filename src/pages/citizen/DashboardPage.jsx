import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, Clock, Flag, Plus, FileWarning, Pencil } from 'lucide-react'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!user) {
      console.log('Dashboard: user is null, skipping query')
      setLoading(false)
      return
    }
    console.log('Dashboard: fetching issues for uid:', user.uid)
    setLoading(true)
    const q = query(
      collection(db, 'issues'),
      where('reportedBy', '==', user.uid),
      orderBy('createdAt', 'desc')
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log('Dashboard: received', list.length, 'documents')
        setComplaints(list)
        setLoading(false)
      },
      (error) => {
        console.error('Dashboard Firestore error:', error)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [user, user.uid])

  const openEdit = (complaint) => {
    setEditTarget(complaint)
    setEditTitle(complaint.title)
    setEditDescription(complaint.description)
    setEditAddress(complaint.address)
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    setSavingEdit(true)
    try {
      await updateDoc(doc(db, 'issues', editTarget.id), {
        title: editTitle,
        description: editDescription,
        address: editAddress,
        updatedAt: serverTimestamp(),
      })
      toast.success('Complaint updated successfully')
      setEditTarget(null)
    } catch {
      toast.error('Failed to update complaint')
    }
    setSavingEdit(false)
  }

  const total = complaints.length
  const pending = complaints.filter((c) => c.status === 'Pending').length
  const inProgress = complaints.filter((c) => c.status === 'In Progress').length
  const resolved = complaints.filter((c) => c.status === 'Resolved').length
  const recent = complaints.slice(0, 5)

  const stats = [
    { label: 'Total Reports', value: total, icon: Flag, color: 'text-primary-600 bg-primary-50 dark:bg-primary-900/30' },
    { label: 'Resolved', value: resolved, icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' },
    { label: 'In Progress', value: inProgress, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Pending', value: pending, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/30' },
  ]

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            {getGreeting()} <span className="wave inline-block">👋</span>
          </h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}. Manage and track your civic complaints.
          </p>
        </div>
        <Button onClick={() => navigate('/report')} className="gap-2 shrink-0 h-11">
          <Plus className="h-5 w-5" /> New Complaint
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.color}`}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
            </div>
          ) : recent.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <FileWarning className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No reports yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {recent.map((report) => (
                <div key={report.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{report.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {report.createdAt?.toDate?.().toLocaleDateString() || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant[report.status] || 'default'} className="capitalize">
                      {report.status}
                    </Badge>
                    {report.status === 'Pending' && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-8" onClick={() => openEdit(report)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Complaint</DialogTitle>
            <DialogDescription>Update the details of your pending complaint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <textarea
                id="edit-desc"
                rows={3}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 resize-none"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-addr">Address</Label>
              <Input id="edit-addr" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
