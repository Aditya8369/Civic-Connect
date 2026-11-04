import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Building2, FileText, Loader2, Save, HardHat, Phone } from 'lucide-react'
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId, ensureComplaintId } from '@/firebase/complaintId'
import { createNotification } from '@/firebase/notifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

const nextStatus = {
  Pending: 'In Progress',
  'In Progress': 'Resolved',
  Reopened: 'In Progress',
  Resolved: null,
  Rejected: null,
}

const departments = ['Roads', 'Sanitation', 'Electricity', 'Water', 'Public Safety']

// Accepts a 10-digit phone number with an optional +91, 91 or 0 prefix,
// ignoring spaces, dashes, dots and brackets.
// Returns it as "+91 XXXXXXXXXX", or null if invalid.
function normalizePhone(value) {
  if (!/^[\d\s()+.-]+$/.test(value.trim())) return null
  const digits = value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '')
  return /^\d{10}$/.test(digits) ? `+91 ${digits}` : null
}

export function AdminComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [citizen, setCitizen] = useState(null)
  const [department, setDepartment] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const isDirty = useRef(false)
  const [saving, setSaving] = useState(false)
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false)
  const [workerName, setWorkerName] = useState('')
  const [workerPhone, setWorkerPhone] = useState('')
  const [workerError, setWorkerError] = useState('')
  const [savingWorker, setSavingWorker] = useState(false)
  const [backfillError, setBackfillError] = useState(false)
  const [backfillRetry, setBackfillRetry] = useState(0)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    let active = true
    let attempted = false
    let committedId = null
    isDirty.current = false

    const unsub = onSnapshot(
      doc(db, 'issues', id),
      (snap) => {
        if (!active) return
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() }
          if (data.complaintId) {
            committedId = data.complaintId
            setBackfillError(false)
          } else if (committedId) {
            data.complaintId = committedId
          } else if (!attempted) {
            attempted = true
            ensureComplaintId(id)
              .then((cid) => {
                if (!active) return
                committedId = cid
                setComplaint((current) =>
                  current?.id === id && !current.complaintId
                    ? { ...current, complaintId: cid }
                    : current
                )
                setBackfillError(false)
              })
              .catch((err) => {
                if (!active || committedId) return
                console.error('Complaint ID backfill failed:', err)
                setBackfillError(true)
              })
          }
          setComplaint(data)
          setDepartment(data.department || '')
          if (!isDirty.current) {
            setResolutionNotes(data.resolutionNotes || '')
          }
          setLoading(false)
          if (data.reportedBy) {
            getDoc(doc(db, 'users', data.reportedBy))
              .then((userSnap) => {
                if (!active) return
                setCitizen(userSnap.exists() ? userSnap.data() : { name: 'Unknown User', email: null })
              })
              .catch(() => {
                if (!active) return
                setCitizen({ name: 'Unknown User', email: null })
              })
          }
        } else {
          setNotFound(true)
          setLoading(false)
        }
      },
      (err) => {
        if (!active) return
        console.error('AdminComplaintDetails Firestore error:', err)
        setNotFound(true)
        setLoading(false)
      }
    )

    return () => {
      active = false
      unsub()
    }
  }, [id, backfillRetry])

  const handleStatusUpdate = async () => {
    const next = nextStatus[complaint.status]
    if (!next) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        status: next,
        ...(next === 'Resolved' && { resolvedAt: serverTimestamp() }),
        updatedAt: serverTimestamp(),
      })
      if (complaint.reportedBy) {
        await createNotification({
          recipientUid: complaint.reportedBy,
          recipientRole: 'citizen',
          senderUid: '',
          issueId: complaint.complaintId || complaint.id,
          type: 'status_update',
          title: 'Complaint Status Updated',
          message:
            next === 'Resolved'
              ? 'Your complaint has been Resolved.'
              : 'Your complaint is now In Progress.',
        })
      }
      toast.success(`Status updated to "${next}"`)
    } catch (err) {
      toast.error('Failed to update status')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleReject = async () => {
    const reason = rejectReason.trim()
    if (!reason) {
      toast.error('Please enter a rejection reason')
      return
    }
    setSaving(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        status: 'Rejected',
        rejectionReason: reason,
        updatedAt: serverTimestamp(),
      })
      if (complaint.reportedBy) {
        await createNotification({
          recipientUid: complaint.reportedBy,
          recipientRole: 'citizen',
          senderUid: '',
          issueId: complaint.complaintId || complaint.id,
          type: 'status_update',
          title: 'Complaint Rejected',
          message: `Your complaint was rejected: ${reason}`,
        })
      }
      toast.success('Complaint rejected')
      setRejectOpen(false)
      setRejectReason('')
    } catch (err) {
      toast.error('Failed to reject complaint')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleDepartmentChange = async (val) => {
    setDepartment(val)
    setSaving(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        department: val,
        updatedAt: serverTimestamp(),
      })
      toast.success(`Department assigned: ${val}`)
    } catch (err) {
      toast.error('Failed to assign department')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        resolutionNotes,
        updatedAt: serverTimestamp(),
      })
      isDirty.current = false
      toast.success('Resolution notes saved')
    } catch (err) {
      toast.error('Failed to save resolution notes')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const openWorkerDialog = () => {
    setWorkerName(complaint.assignedWorker?.name || '')
    setWorkerPhone(complaint.assignedWorker?.phone || '')
    setWorkerError('')
    setWorkerDialogOpen(true)
  }

  const handleSaveWorker = async () => {
    const name = workerName.trim()
    const phone = normalizePhone(workerPhone)
    if (!name) {
      setWorkerError('Please enter the worker name')
      return
    }
    if (!phone) {
      setWorkerError('Please enter a 10-digit phone number (optionally with +91)')
      return
    }
    setSavingWorker(true)
    try {
      await updateDoc(doc(db, 'issues', id), {
        assignedWorker: { name, phone, assignedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      })
      toast.success(`Worker assigned: ${name}`)
      setWorkerDialogOpen(false)
    } catch (err) {
      toast.error('Failed to assign worker')
      console.error(err)
    } finally {
      setSavingWorker(false)
    }
  }

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
        <p className="text-lg font-semibold text-gray-900 dark:text-white">Complaint not found</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">This complaint does not exist or has been removed.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/admin/reports')}>
          Back to Reports
        </Button>
      </div>
    )
  }

  const canReject = ['Pending', 'In Progress', 'Reopened'].includes(complaint.status)

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/admin/reports')}
        className="gap-2 mb-6 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Reports
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-primary-600 dark:text-primary-400 font-semibold">{getDisplayId(complaint)}</span>
                    <Badge variant={statusVariant[complaint.status] || 'default'} className="capitalize">
                      {complaint.status}
                    </Badge>
                  </div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{complaint.title}</h1>
                  {backfillError && (
                    <div role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                      Could not assign a ticket ID.{' '}
                      <Button variant="outline" size="sm" onClick={() => {
                        setBackfillError(false)
                        setBackfillRetry(value => value + 1)
                      }}>
                        Retry ticket ID
                      </Button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {canReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRejectOpen(true)}
                      disabled={saving}
                    >
                      Reject
                    </Button>
                  )}
                  {nextStatus[complaint.status] && (
                    <Button
                      onClick={handleStatusUpdate}
                      disabled={saving}
                      size="sm"
                      className="gap-2"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Mark {nextStatus[complaint.status]}
                    </Button>
                  )}
                </div>
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
                    {complaint.updatedAt?.toDate?.().toLocaleDateString() || '-'}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.description}</p>
              </div>

              {complaint.status === 'Rejected' && complaint.rejectionReason && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20">
                  <p className="font-medium text-red-700 dark:text-red-300">Rejection reason</p>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.rejectionReason}</p>
                </div>
              )}

              {complaint.status === 'Reopened' && complaint.reopenReason && (
                <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
                  <p className="font-medium text-amber-800 dark:text-amber-300">Citizen feedback (reopened)</p>
                  <p className="mt-1 text-gray-700 dark:text-gray-300">{complaint.reopenReason}</p>
                </div>
              )}

              <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{complaint.address}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Assign Department
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs">
                <Select value={department} onValueChange={handleDepartmentChange} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Resolution Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={resolutionNotes}
                onChange={(e) => {
                  isDirty.current = true
                  setResolutionNotes(e.target.value)
                }}
                placeholder="Enter resolution notes..."
                rows={5}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 mb-4"
              />
              <Button onClick={handleSaveNotes} disabled={saving} size="sm" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Notes
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Citizen Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                <p className="font-medium text-gray-900 dark:text-white">{citizen?.name || 'Unknown User'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Email</p>
                <p className="font-medium text-gray-900 dark:text-white">{citizen?.email || '-'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardHat className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                Field Worker
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {complaint.assignedWorker ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Name</p>
                    <p className="font-medium text-gray-900 dark:text-white">{complaint.assignedWorker.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Contact</p>
                    <a
                      href={`tel:${complaint.assignedWorker.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {complaint.assignedWorker.phone}
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">No worker assigned yet.</p>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={openWorkerDialog}>
                {complaint.assignedWorker ? 'Change Worker' : 'Assign Worker'}
              </Button>
            </CardContent>
          </Card>

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
        </div>
      </div>

      <Dialog open={workerDialogOpen} onOpenChange={setWorkerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Field Worker</DialogTitle>
            <DialogDescription>Enter the details of the worker responsible for this complaint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-name">Worker Name</Label>
              <Input
                id="worker-name"
                placeholder="e.g. Ramesh Kumar"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-phone">Contact Number</Label>
              <Input
                id="worker-phone"
                type="tel"
                placeholder="e.g. +91 9876543210"
                value={workerPhone}
                onChange={(e) => setWorkerPhone(e.target.value)}
              />
            </div>
            {workerError && <p className="text-sm text-red-600 dark:text-red-400">{workerError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWorkerDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveWorker} disabled={savingWorker}>
              {savingWorker ? 'Saving...' : 'Save Worker'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Complaint</DialogTitle>
            <DialogDescription>A reason is required and will be shown to the citizen.</DialogDescription>
          </DialogHeader>
          <textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. Outside municipal jurisdiction, Duplicate report"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={saving}>
              {saving ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}