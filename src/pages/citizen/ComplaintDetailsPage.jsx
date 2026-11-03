import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, CalendarDays, Building2, FileText, ClipboardCheck, Clock, AlertTriangle } from 'lucide-react'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { createNotification } from '@/firebase/notifications'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  Rejected: 'secondary',
  Reopened: 'warning',
}

const statusSteps = {
  Pending: ['Submitted', 'Under Review'],
  'In Progress': ['Submitted', 'Under Review', 'Assigned to Department', 'In Progress'],
  Resolved: ['Submitted', 'Under Review', 'Assigned to Department', 'In Progress', 'Resolved'],
  Rejected: ['Submitted', 'Under Review', 'Rejected'],
  Reopened: ['Submitted', 'Under Review', 'Assigned to Department', 'In Progress', 'Resolved', 'Reopened'],
}

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'issues', id),
      (snap) => {
        if (snap.exists()) {
          setComplaint({ id: snap.id, ...snap.data() })
        } else {
          setNotFound(true)
        }
        setLoading(false)
      },
      (error) => {
        console.error('ComplaintDetails Firestore error:', error)
        setNotFound(true)
        setLoading(false)
      }
    )
    return unsub
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !complaint) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Complaint not found</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">This complaint does not exist or has been removed.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/my-reports')}>
          Back to My Reports
        </Button>
      </div>
    )
  }

  const steps = statusSteps[complaint.status] || ['Submitted']
  const completedCount = steps.length
  const lastUpdated = complaint.updatedAt?.toDate?.() || complaint.createdAt?.toDate?.()

  const resolvedAt = complaint.resolvedAt?.toDate?.()
  const canReopen =
    complaint.status === 'Resolved' &&
    !!resolvedAt &&
    Date.now() - resolvedAt.getTime() <= REOPEN_WINDOW_MS

  const handleReopen = async () => {
    const reason = feedback.trim()
    if (!reason) {
      toast.error('Please tell us what is still not fixed')
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        status: 'Reopened',
        reopenReason: reason,
        reopenedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      await createNotification({
        recipientUid: null,
        recipientRole: 'admin',
        senderUid: user.uid,
        issueId: complaint.complaintId || complaint.id,
        type: 'status_update',
        title: 'Complaint Reopened',
        message: `A citizen reopened a resolved complaint: ${reason}`,
      })
      toast.success('Complaint reopened')
      setReopenOpen(false)
      setFeedback('')
    } catch (err) {
      toast.error('Failed to reopen complaint')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/my-reports')}
          className="gap-2 mb-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to My Reports
        </Button>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(complaint)}</span>
                      <Badge variant={statusVariant[complaint.status] || 'default'} className="capitalize">
                        {complaint.status}
                      </Badge>
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{complaint.title}</h1>
                  </div>
                  {canReopen && (
                    <Button size="sm" className="shrink-0" onClick={() => setReopenOpen(true)}>
                      Reopen Issue
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Category</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{complaint.category || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Department</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">{complaint.department || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Created</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {complaint.createdAt?.toDate?.().toLocaleDateString() || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Updated</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {lastUpdated?.toLocaleDateString() || '-'}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.description}</p>
                </div>

                {complaint.status === 'Rejected' && complaint.rejectionReason && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20">
                    <p className="font-medium text-red-700 dark:text-red-300">Reason for rejection</p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.rejectionReason}</p>
                  </div>
                )}

                {complaint.status === 'Reopened' && complaint.reopenReason && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
                    <p className="font-medium text-amber-800 dark:text-amber-300">Your reopen feedback</p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.reopenReason}</p>
                  </div>
                )}

                <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{complaint.address}</span>
                </div>
                <div className="mt-1 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <CalendarDays className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Submitted on {complaint.createdAt?.toDate?.().toLocaleDateString() || '-'}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Status Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative ml-2">
                  <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-gray-800" />
                  <div className="space-y-6">
                    {steps.map((step, i) => (
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.08 }}
                        className="relative flex gap-4"
                      >
                        <div
                          className={`relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 ${
                            i < completedCount
                              ? 'border-primary-600 bg-primary-600 dark:border-primary-400 dark:bg-primary-400'
                              : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900'
                          }`}
                        >
                          {i < completedCount && (
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <p className={`text-sm font-medium ${i < completedCount ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                            {step}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Resolution Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                  {complaint.resolutionNotes ? (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{complaint.department || 'Unassigned'}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.resolutionNotes}</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500">No resolution notes yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg bg-gray-100 dark:bg-gray-800 h-48 flex items-center justify-center overflow-hidden">
                  <div className="text-center">
                    <MapPin className="h-8 w-8 text-primary-600 dark:text-primary-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">{complaint.address}</p>
                    {complaint.latitude && complaint.longitude && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {complaint.latitude}, {complaint.longitude}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Issue</DialogTitle>
            <DialogDescription>
              Tell us what is still not fixed. Issues can be reopened within 7 days of resolution.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe what is still wrong..."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button onClick={handleReopen} disabled={saving}>
              {saving ? 'Submitting...' : 'Reopen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
