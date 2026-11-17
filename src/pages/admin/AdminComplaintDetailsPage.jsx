import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  MapPin,
  Building2,
  FileText,
  Loader2,
  Save,
  HardHat,
  Phone,
  Star,
  Camera,
  ZoomIn,
  ZoomOut,
  ExternalLink,
  GitMerge,
  Search,
} from 'lucide-react'
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
} from 'firebase/firestore'
import { auth, db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { logComplaintEvent } from '@/firebase/complaintEvents'
import { getDisplayId, ensureComplaintId } from '@/firebase/complaintId'
import { commitComplaintTransition } from '@/firebase/complaintLifecycle'
import { assignComplaintDepartment } from '@/firebase/complaintDepartment'
import { mergeComplaints } from '@/firebase/complaintMerge'
import { loadResolutionTemplates } from '@/firebase/resolutionTemplates'
import { ComplaintAuditTimeline } from '@/components/admin/ComplaintAuditTimeline'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SlaBadge, SlaCountdown } from '@/components/common/SlaBadge'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import { ResolutionTemplateSelector } from '@/components/admin/ResolutionTemplateSelector'
import { getSlaTargetDate } from '@/utils/sla'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { normalizePhone } from '@/utils/phone'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import ComplaintAudioPlayer from '@/components/citizen/ComplaintAudioPlayer'
import ResolutionProofSlider, { getResolutionPhoto } from '@/components/citizen/ResolutionProofSlider'
import { ComplaintLocationMap } from '@/components/common/ComplaintLocationMap'

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
  'Merged - Duplicate': 'secondary',
}

const statusTranslationKeys = {
  Resolved: 'statusResolved',
  'In Progress': 'statusInProgress',
  Pending: 'statusPending',
  Rejected: 'statusRejected',
  Reopened: 'statusReopened',
  'Merged - Duplicate': 'statusMerged',
}

const nextStatus = {
  Pending: 'In Progress',
  'In Progress': 'Resolved',
  Reopened: 'In Progress',
  Resolved: null,
  Rejected: null,
}

const departments = [
  'Roads',
  'Sanitation',
  'Electricity',
  'Water',
  'Public Safety',
]

const departmentTranslationKeys = {
  Roads: 'departmentRoads',
  Sanitation: 'departmentSanitation',
  Electricity: 'departmentElectricity',
  Water: 'departmentWater',
  'Public Safety': 'departmentPublicSafety',
}

const ratingTranslationKeys = {
  1: 'ratingPoor',
  2: 'ratingFair',
  3: 'ratingGood',
  4: 'ratingVeryGood',
  5: 'ratingExcellent',
}

function canRejectComplaint(complaint) {
  return ['Pending', 'In Progress', 'Reopened'].includes(complaint?.status)
}

function canMergeComplaint(complaint) {
  return ['Pending', 'In Progress', 'Reopened'].includes(complaint?.status)
}



function EvidenceImage({ src, alt, onClick, className = '' }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`absolute inset-0 h-full w-full object-cover ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      onClick={onClick}
    />
  )
}



export function AdminComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, language } = useLanguage()

  const locale = language === 'hi' ? 'hi-IN' : 'en-US'

  const translateStatus = (status) =>
    statusTranslationKeys[status]
      ? t(statusTranslationKeys[status])
      : status

  const translateDepartment = (department) =>
    departmentTranslationKeys[department]
      ? t(departmentTranslationKeys[department])
      : department

  const { user: authUser } = useAuth()
  const actorUid = authUser?.uid || auth?.currentUser?.uid || null

  const [complaint, setComplaint] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [citizen, setCitizen] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventsError, setEventsError] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolutionTemplates, setResolutionTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const isDirty = useRef(false)
  const [saving, setSaving] = useState(false)
  const transitionPending = useRef(false)

  const [workerDialogOpen, setWorkerDialogOpen] = useState(false)
  const [workerName, setWorkerName] = useState('')
  const [workerPhone, setWorkerPhone] = useState('')
  const [workerError, setWorkerError] = useState('')
  const [savingWorker, setSavingWorker] = useState(false)

  const [backfillError, setBackfillError] = useState(false)
  const [backfillRetry, setBackfillRetry] = useState(0)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [candidateComplaints, setCandidateComplaints] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedParentId, setSelectedParentId] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [merging, setMerging] = useState(false)

  useEffect(() => {
    let active = true
    setEventsLoading(true)
    setEventsError(null)
    setEvents([])

    const unsubEvents = onSnapshot(
      collection(db, `issues/${id}/events`),
      (snap) => {
        if (!active) return
        if (snap?.docs) {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          setEvents(sortEvents(list))
        } else {
          setEvents([])
        }
        setEventsLoading(false)
      },
      (err) => {
        if (!active) return
        console.error('AdminComplaintDetails events Firestore error:', err)
        setEventsError(err)
        setEventsLoading(false)
      }
    )

    return () => {
      active = false
      unsubEvents()
    }
  }, [id])

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

          if (!isDirty.current) {
            setResolutionNotes(data.resolutionNotes || '')
          }

          setLoading(false)

          if (data.reportedBy) {
            getDoc(doc(db, 'users', data.reportedBy))
              .then((userSnap) => {
                if (!active) return

                setCitizen(
                  userSnap.exists()
                    ? userSnap.data()
                    : { name: 'Unknown User', email: null }
                )
              })
              .catch(() => {
                if (!active) return
                setCitizen({ name: 'Unknown User', email: null })
              })
          }
        } else {
          const q = query(
            collection(db, 'issues'),
            where('complaintId', '==', id),
            limit(1)
          )

          getDocs(q)
            .then((querySnap) => {
              if (!active) return

              if (querySnap && !querySnap.empty) {
                navigate(
                  `/admin/reports/${querySnap.docs[0].id}`,
                  { replace: true }
                )
              } else {
                setNotFound(true)
                setLoading(false)
              }
            })
            .catch(() => {
              if (!active) return
              setNotFound(true)
              setLoading(false)
            })
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
  }, [id, backfillRetry, navigate])

  useEffect(() => {
    let active = true

    loadResolutionTemplates().then((templates) => {
      if (active) setResolutionTemplates(templates)
    })

    return () => {
      active = false
    }
  }, [])

  const handleStatusUpdate = async () => {
    const next = nextStatus[complaint.status]

    if (!next || saving || transitionPending.current) return

    transitionPending.current = true
    setSaving(true)

    try {
      await commitComplaintTransition(
        id,
        complaint.status,
        {
          status: next,
          ...(next === 'Resolved' && {
            resolvedAt: serverTimestamp(),
          }),
          updatedAt: serverTimestamp(),
        },
        (current) =>
          current.reportedBy
            ? {
                recipientUid: current.reportedBy,
                recipientRole: 'citizen',
                senderUid: actorUid || '',
                issueId: current.complaintId || id,
                type: 'status_update',
                title: 'Complaint Status Updated',
                message:
                  next === 'Resolved'
                    ? 'Your complaint has been Resolved.'
                    : 'Your complaint is now In Progress.',
              }
            : null,
        () => true,
        (current) => ({
          actorUid,
          action: 'Status changed',
          previousStatus: current.status,
          newStatus: next,
          remarks: `Status updated to ${next}`,
        })
      )

      toast.success(
        t('adminStatusUpdated').replace(
          '{status}',
          translateStatus(next)
        )
      )
    } catch (err) {
      toast.error(t('adminStatusUpdateFailed'))
      console.error(err)
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  const handleReject = async () => {
    if (saving || transitionPending.current) return

    if (!canRejectComplaint(complaint)) {
      toast.error(t('adminComplaintCannotBeRejected'))
      return
    }

    const reason = rejectReason.trim()

    if (!reason) {
      toast.error(t('adminEnterRejectionReason'))
      return
    }

    transitionPending.current = true
    setSaving(true)

    try {
      await commitComplaintTransition(
        id,
        complaint.status,
        {
          status: 'Rejected',
          rejectionReason: reason,
          updatedAt: serverTimestamp(),
        },
        (current) =>
          current.reportedBy
            ? {
                recipientUid: current.reportedBy,
                recipientRole: 'citizen',
                senderUid: actorUid || '',
                issueId: current.complaintId || id,
                type: 'status_update',
                title: 'Complaint Rejected',
                message: `Your complaint was rejected: ${reason}`,
              }
            : null,
        canRejectComplaint,
        () => ({
          actorUid,
          action: 'Status changed',
          previousStatus: complaint.status,
          newStatus: 'Rejected',
          remarks: reason,
        })
      )

      toast.success(t('adminComplaintRejected'))
      setRejectOpen(false)
      setRejectReason('')
    } catch (err) {
      toast.error(t('adminRejectFailed'))
      console.error(err)
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  const handleDepartmentChange = async (val) => {
    if (saving || transitionPending.current) return

    transitionPending.current = true
    setSaving(true)

    try {
      const changed = await assignComplaintDepartment(
        id,
        val,
        actorUid
      )

      if (changed) {
        toast.success(
          t('adminDepartmentAssigned').replace(
            '{department}',
            translateDepartment(val)
          )
        )
      }
    } catch (err) {
      toast.error(t('adminDepartmentAssignFailed'))
      console.error(err)
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  const handleTemplateSelect = (templateId) => {
    setSelectedTemplateId(templateId)

    const template = resolutionTemplates.find((item) => item.id === templateId)
    if (!template) return

    isDirty.current = true
    setResolutionNotes(template.body)
    toast.success(`Applied "${template.title}" template`)
  }

  const handleSaveNotes = async () => {
    setSaving(true)

    try {
      await updateDoc(doc(db, 'issues', id), {
        resolutionNotes,
        updatedAt: serverTimestamp(),
      })

      await logComplaintEvent(id, {
        actorUid,
        action: 'Resolution notes updated',
        previousStatus: complaint.status,
        newStatus: complaint.status,
        remarks: resolutionNotes,
      })

      isDirty.current = false
      toast.success(t('adminResolutionNotesSaved'))
    } catch (err) {
      toast.error(t('adminResolutionNotesFailed'))
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const openMergeDialog = async () => {
    setSelectedParentId('')
    setSearchQuery('')
    setMergeOpen(true)
    setLoadingCandidates(true)

    try {
      const q = query(
        collection(db, 'issues'),
        orderBy('createdAt', 'desc'),
        limit(50)
      )

      const snap = await getDocs(q)

      const list = (snap?.docs || [])
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .filter(
          (c) =>
            c.id !== id &&
            c.status !== 'Merged - Duplicate' &&
            c.status !== 'Rejected'
        )

      setCandidateComplaints(list)
    } catch (err) {
      console.error('Failed to load candidate complaints:', err)
      toast.error(t('adminEligibleComplaintsLoadFailed'))
    } finally {
      setLoadingCandidates(false)
    }
  }

  const handleConfirmMerge = async () => {
    if (!selectedParentId) {
      toast.error(t('adminSelectParentComplaint'))
      return
    }

    setMerging(true)

    try {
      const result = await mergeComplaints({
        childId: id,
        parentId: selectedParentId,
        actorUid,
        expectedChildStatus: complaint.status,
      })

      toast.success(
        t('adminComplaintMerged').replace(
          '{id}',
          result.parentComplaintId
        )
      )

      setMergeOpen(false)
    } catch (err) {
      console.error('Merge error:', err)
      toast.error(err.message || t('adminMergeFailed'))
    } finally {
      setMerging(false)
    }
  }

  const filteredCandidates = candidateComplaints.filter((c) => {
    if (!searchQuery.trim()) return true

    const q = searchQuery.toLowerCase()

    return (
      (c.complaintId || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q) ||
      (c.title || '').toLowerCase().includes(q) ||
      (c.category || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q)
    )
  })

  useEffect(() => {
    const qTrim = searchQuery.trim()

    if (!qTrim || !mergeOpen) return

    const timer = setTimeout(async () => {
      try {
        const qUpper = qTrim.toUpperCase()

        const qByCid = query(
          collection(db, 'issues'),
          where('complaintId', '==', qUpper),
          limit(5)
        )

        const snap = await getDocs(qByCid)

        if (snap?.docs?.length) {
          const found = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter(
              (c) =>
                c.id !== id &&
                c.status !== 'Merged - Duplicate' &&
                c.status !== 'Rejected'
            )

          if (found.length > 0) {
            setCandidateComplaints((prev) => {
              const existingIds = new Set(prev.map((p) => p.id))
              const newItems = found.filter(
                (f) => !existingIds.has(f.id)
              )

              return newItems.length > 0
                ? [...prev, ...newItems]
                : prev
            })
          }
        }
      } catch {
        // Ignore fallback search error
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, mergeOpen, id])

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
      setWorkerError(t('adminEnterWorkerName'))
      return
    }

    if (!phone) {
      setWorkerError(t('adminEnterValidWorkerPhone'))
      return
    }

    setSavingWorker(true)

    try {
      await updateDoc(doc(db, 'issues', id), {
        assignedWorker: {
          name,
          phone,
          assignedAt: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      })

      await logComplaintEvent(id, {
        actorUid,
        action: 'Field worker designated',
        previousStatus: complaint.status,
        newStatus: complaint.status,
        remarks: `Assigned to ${name} (${phone})`,
      })

      toast.success(
        t('adminWorkerAssigned').replace('{name}', name)
      )

      setWorkerDialogOpen(false)
    } catch (err) {
      toast.error(t('adminWorkerAssignFailed'))
      console.error(err)
    } finally {
      setSavingWorker(false)
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center justify-center py-20"
        role="status"
        aria-label={t('loadingComplaintDetails')}
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (notFound || !complaint) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('adminComplaintNotFound')}
        </p>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('adminComplaintRemovedDescription')}
        </p>

        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => navigate('/admin/reports')}
        >
          {t('backToReports')}
        </Button>
      </div>
    )
  }

  const canReject = canRejectComplaint(complaint)
  const slaTarget = getSlaTargetDate(
    complaint.createdAt,
    complaint.category,
    complaint.department
  )
  const initialPhoto = complaint.imageUrl || complaint.photos?.[0]
  const resolutionPhoto = getResolutionPhoto(complaint)

  const formatDate = (timestamp) =>
    timestamp?.toDate?.().toLocaleDateString(locale) || '-'

  const formatSlaDate = () =>
    slaTarget
      ? slaTarget.toLocaleDateString(locale, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : '-'

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/admin/reports')}
        className="mb-6 gap-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('backToReports')}
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">
                      {getDisplayId(complaint)}
                    </span>

                    <Badge
                      variant={
                        statusVariant[complaint.status] || 'default'
                      }
                      className="capitalize"
                    >
                      {translateStatus(complaint.status)}
                    </Badge>

                    <SlaBadge complaint={complaint} />
                  </div>

                  <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    {complaint.title}
                  </h1>

                  {complaint.status === 'Merged - Duplicate' && (
                    <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm dark:border-purple-900/50 dark:bg-purple-900/20">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GitMerge className="h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
                          <span className="font-medium text-purple-900 dark:text-purple-200">
                            {t('adminMergedIntoParent')}:{' '}
                            <span className="font-mono font-semibold">
                              {complaint.mergedInto || 'CMP-XXXX-XXXX'}
                            </span>
                          </span>
                        </div>

                        {(complaint.mergedIntoId ||
                          complaint.mergedInto) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 border-purple-300 text-xs text-purple-700 dark:border-purple-800 dark:text-purple-300"
                            onClick={() =>
                              navigate(
                                `/admin/reports/${
                                  complaint.mergedIntoId ||
                                  complaint.mergedInto
                                }`
                              )
                            }
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('viewParentTicket')}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {backfillError && (
                    <div
                      role="alert"
                      className="mt-2 text-sm text-red-600 dark:text-red-400"
                    >
                      {t('adminTicketIdAssignmentFailed')}{' '}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setBackfillError(false)
                          setBackfillRetry((value) => value + 1)
                        }}
                      >
                        {t('retryTicketId')}
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  {canReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRejectOpen(true)}
                      disabled={saving || merging}
                    >
                      {t('reject')}
                    </Button>
                  )}

                  {canMergeComplaint(complaint) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openMergeDialog}
                      disabled={saving || merging}
                      className="gap-1.5"
                    >
                      <GitMerge className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      {t('mergeIntoParentComplaint')}
                    </Button>
                  )}

                  {nextStatus[complaint.status] && (
                    <Button
                      onClick={handleStatusUpdate}
                      disabled={saving || merging}
                      size="sm"
                      className="gap-2"
                    >
                      {saving && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {t('markStatus').replace(
                        '{status}',
                        translateStatus(nextStatus[complaint.status])
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-y border-gray-100 py-4 dark:border-gray-800 sm:grid-cols-5">
                <div>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('categoryLabel')}
                  </p>

                  {complaint.category ? (
                    <CategoryAvatar
                      category={complaint.category}
                      size="xs"
                    />
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                      -
                    </p>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('departmentLabel')}
                  </p>

                  <DepartmentCrest
                    department={complaint.department}
                    category={complaint.category}
                    size="xs"
                  />
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('created')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(complaint.createdAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('updated')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {formatDate(complaint.updatedAt)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('slaTarget')}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-white">
                    {formatSlaDate()}
                  </p>
                </div>
              </div>

              <SlaCountdown complaint={complaint} className="mt-4" />

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {t('description')}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {complaint.description}
                </p>
              </div>

              {(initialPhoto || resolutionPhoto) && (
                <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
                    <Camera className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                    {t('photoEvidence')}
                  </h3>

                  <div className="group relative inline-block w-full max-w-xl overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                    <ResolutionProofSlider
                      beforePhoto={initialPhoto}
                      afterPhoto={resolutionPhoto}
                      onImageClick={() => setZoomOpen(true)}
                      t={t}
                    />

                    <button
                      type="button"
                      onClick={() => setZoomOpen(true)}
                      className="absolute inset-0 flex cursor-pointer items-center justify-center gap-1.5 bg-black/30 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t('zoomInPhotoEvidence')}
                    >
                      <ZoomIn className="h-4 w-4" />
                      {t('clickToZoom')}
                    </button>
                  </div>
                </div>
              )}

              {complaint.status === 'Rejected' &&
                complaint.rejectionReason && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm dark:bg-red-900/20">
                    <p className="font-medium text-red-700 dark:text-red-300">
                      {t('rejectionReason')}
                    </p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">
                      {complaint.rejectionReason}
                    </p>
                  </div>
                )}

              {complaint.status === 'Reopened' &&
                complaint.reopenReason && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      {t('citizenFeedbackReopened')}
                    </p>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">
                      {complaint.reopenReason}
                    </p>
                  </div>
                )}

              <ComplaintAudioPlayer audioNote={complaint.audioNote} />

              <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{complaint.address}</span>
              </div>
            </CardContent>
          </Card>

          {complaint.mergedChildIds &&
            complaint.mergedChildIds.length > 0 && (
              <Card className="border-purple-200 dark:border-purple-900/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base text-purple-900 dark:text-purple-200">
                      <GitMerge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      {t('consolidatedDuplicateComplaints').replace(
                        '{count}',
                        String(complaint.mergedChildIds.length)
                      )}
                    </CardTitle>

                    <Badge
                      variant="secondary"
                      className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                    >
                      {t('primaryTicket')}
                    </Badge>
                  </div>

                  <CardDescription>
                    {t('consolidatedComplaintsDescription')}
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {complaint.mergedChildIds.map((childId, idx) => {
                      const cidDisplay =
                        complaint.mergedChildComplaintIds?.[idx] ||
                        childId

                      return (
                        <div
                          key={childId}
                          className="flex items-center justify-between py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="border-purple-300 font-mono text-xs text-purple-700 dark:border-purple-800 dark:text-purple-300"
                            >
                              {cidDisplay}
                            </Badge>

                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {t('mergedDuplicate')}
                            </span>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs text-primary-600 dark:text-primary-400"
                            onClick={() =>
                              navigate(`/admin/reports/${childId}`)
                            }
                          >
                            {t('view')}
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                {t('assignDepartment')}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="max-w-xs">
                <Select
                  value={complaint.department || ''}
                  onValueChange={handleDepartmentChange}
                  disabled={saving}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectDepartment')} />
                  </SelectTrigger>

                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        <div className="flex items-center gap-2">
                          <DepartmentCrest
                            department={dept}
                            variant="avatar"
                            size="xs"
                          />
                          <span>{translateDepartment(dept)}</span>
                        </div>
                      </SelectItem>
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
                {t('resolutionNotes')}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className="mb-4">
                <ResolutionTemplateSelector
                  templates={resolutionTemplates}
                  value={selectedTemplateId}
                  onChange={handleTemplateSelect}
                  disabled={saving}
                />
              </div>
              <textarea
                value={resolutionNotes}
                onChange={(e) => {
                  isDirty.current = true
                  setResolutionNotes(e.target.value)
                }}
                placeholder={t('enterResolutionNotes')}
                rows={5}
                className="mb-4 flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
              />

              <Button
                onClick={handleSaveNotes}
                disabled={saving}
                size="sm"
                className="gap-2"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('saveNotes')}
              </Button>
            </CardContent>
          </Card>

          <ComplaintAuditTimeline
            complaint={complaint}
            events={events}
            loading={eventsLoading}
            error={eventsError}
          />

          {complaint.feedback ? (
            <Card className="border-amber-200 dark:border-amber-900/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Star className="h-5 w-5 fill-amber-500 text-amber-500" />
                    {t('citizenFeedback')}
                  </CardTitle>

                  <Badge variant="success">{t('rated')}</Badge>
                </div>

                <CardDescription>
                  {t('satisfactionRatingDescription')}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`h-5 w-5 ${
                          s <= complaint.feedback.rating
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-gray-300 dark:text-gray-700'
                        }`}
                      />
                    ))}
                  </div>

                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {complaint.feedback.rating} / 5
                  </span>

                  {ratingTranslationKeys[complaint.feedback.rating] && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      (
                      {t(
                        ratingTranslationKeys[
                          complaint.feedback.rating
                        ]
                      )}
                      )
                    </span>
                  )}
                </div>

                {complaint.feedback.comment ? (
                  <p className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300">
                    "{complaint.feedback.comment}"
                  </p>
                ) : (
                  <p className="text-xs italic text-gray-400 dark:text-gray-500">
                    {t('noAdditionalComment')}
                  </p>
                )}

                {complaint.feedback.submittedAt && (
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('submittedOn')}{' '}
                    {formatDate(complaint.feedback.submittedAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : complaint.status === 'Resolved' ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Star className="h-5 w-5 text-gray-400" />
                  {t('citizenFeedback')}
                </CardTitle>
              </CardHeader>

              <CardContent>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {t('awaitingCitizenFeedback')}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                {t('citizenInformation')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('name')}
                </p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {citizen?.name || t('unknownUser')}
                </p>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('email')}
                </p>
                <p className="font-medium text-gray-900 dark:text-white">
                  {citizen?.email || '-'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardHat className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                {t('fieldWorker')}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              {complaint.assignedWorker ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('name')}
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {complaint.assignedWorker.name}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('contact')}
                    </p>

                    <a
                      href={`tel:${complaint.assignedWorker.phone.replace(
                        /\s/g,
                        ''
                      )}`}
                      className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {complaint.assignedWorker.phone}
                    </a>
                  </div>
                </>
              ) : (
                <p className="text-gray-500 dark:text-gray-400">
                  {t('noWorkerAssigned')}
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={openWorkerDialog}
              >
                {complaint.assignedWorker
                  ? t('changeWorker')
                  : t('assignWorker')}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                {t('location')}
              </CardTitle>
            </CardHeader>

            <CardContent>
              <ComplaintLocationMap
                latitude={complaint.latitude}
                longitude={complaint.longitude}
                address={complaint.address}
                height="240px"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={workerDialogOpen}
        onOpenChange={setWorkerDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assignFieldWorker')}</DialogTitle>
            <DialogDescription>
              {t('workerAssignmentDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="worker-name">
                {t('workerName')}
              </Label>

              <Input
                id="worker-name"
                placeholder={t('workerNamePlaceholder')}
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="worker-phone">
                {t('contactNumber')}
              </Label>

              <Input
                id="worker-phone"
                type="tel"
                placeholder={t('workerPhonePlaceholder')}
                value={workerPhone}
                onChange={(e) => setWorkerPhone(e.target.value)}
              />
            </div>

            {workerError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {workerError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWorkerDialogOpen(false)}
            >
              {t('cancel')}
            </Button>

            <Button
              onClick={handleSaveWorker}
              disabled={savingWorker}
            >
              {savingWorker
                ? t('saving')
                : t('saveWorker')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rejectComplaint')}</DialogTitle>
            <DialogDescription>
              {t('rejectionReasonDescription')}
            </DialogDescription>
          </DialogHeader>

          <textarea
            rows={4}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t('rejectionReasonPlaceholder')}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
            >
              {t('cancel')}
            </Button>

            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={saving}
            >
              {saving ? t('rejecting') : t('reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              {t('mergeIntoParentComplaint')}
            </DialogTitle>

            <DialogDescription>
              {t('mergeComplaintDescription')
                .replace('{id}', getDisplayId(complaint))}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="search-parent">
                {t('searchParentComplaint')}
              </Label>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />

                <Input
                  id="search-parent"
                  placeholder={t('searchParentPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('selectPrimaryComplaint')}</Label>

              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800">
                  {t('noEligibleParentComplaints')}
                </div>
              ) : (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2 pr-1 dark:border-gray-800">
                  {filteredCandidates.map((candidate) => {
                    const candidateDisplayId =
                      getDisplayId(candidate)
                    const isSelected =
                      selectedParentId === candidate.id

                    return (
                      <div
                        key={candidate.id}
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setSelectedParentId(candidate.id)
                        }
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' ||
                            e.key === ' '
                          ) {
                            e.preventDefault()
                            setSelectedParentId(candidate.id)
                          }
                        }}
                        className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                          isSelected
                            ? 'border-purple-600 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/30'
                            : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">
                            {candidateDisplayId}
                          </span>

                          <Badge
                            variant={
                              statusVariant[candidate.status] ||
                              'default'
                            }
                            className="text-[10px]"
                          >
                            {translateStatus(candidate.status)}
                          </Badge>
                        </div>

                        <p className="mt-1 line-clamp-1 text-sm font-medium text-gray-900 dark:text-white">
                          {candidate.title}
                        </p>

                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                          {candidate.address} • {candidate.category}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedParentId && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {t('mergeConfirmationWarning')}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergeOpen(false)}
              disabled={merging}
            >
              {t('cancel')}
            </Button>

            <Button
              onClick={handleConfirmMerge}
              disabled={merging || !selectedParentId}
              className="gap-2 bg-purple-600 text-white hover:bg-purple-700"
            >
              {merging ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4" />
              )}
              {t('confirmMerge')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={zoomOpen}
        onOpenChange={(open) => {
          setZoomOpen(open)
          if (!open) setZoomScale(1)
        }}
      >
        <DialogContent className="max-w-3xl p-4 sm:p-6">
          <DialogHeader className="mb-2">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>{t('photoEvidence')}</DialogTitle>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-100 px-1 py-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                  <button
                    type="button"
                    disabled={zoomScale <= 0.75}
                    onClick={() =>
                      setZoomScale((s) =>
                        Math.max(0.5, s - 0.25)
                      )
                    }
                    className="rounded p-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700"
                    title={t('zoomOut')}
                    aria-label={t('zoomOut')}
                  >
                    <ZoomOut className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="rounded px-1.5 py-0.5 font-mono text-[11px] text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    title={t('resetZoom')}
                    aria-label={t('resetZoom')}
                  >
                    {Math.round(zoomScale * 100)}%
                  </button>

                  <button
                    type="button"
                    disabled={zoomScale >= 3}
                    onClick={() =>
                      setZoomScale((s) =>
                        Math.min(3, s + 0.25)
                      )
                    }
                    className="rounded p-1 hover:bg-gray-200 disabled:opacity-40 dark:hover:bg-gray-700"
                    title={t('zoomIn')}
                    aria-label={t('zoomIn')}
                  >
                    <ZoomIn className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>

                {(initialPhoto || resolutionPhoto) && (
                  <a
                    href={initialPhoto || resolutionPhoto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-primary-600 hover:underline dark:text-primary-400"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t('openOriginal')}
                  </a>
                )}
              </div>
            </div>

            <DialogDescription>
              {t('visualProofAttached').replace(
                '{id}',
                getDisplayId(complaint)
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[70vh] items-center justify-center overflow-auto rounded-lg bg-black/5 p-2 dark:bg-black/40">
            <img
              src={initialPhoto || resolutionPhoto}
              alt={t('enlargedComplaintEvidence')}
              style={{
                transform: `scale(${zoomScale})`,
                transformOrigin: 'center center',
              }}
              className={`max-h-[65vh] w-auto max-w-full rounded-md object-contain transition-transform duration-150 ${
                zoomScale === 1
                  ? 'cursor-zoom-in'
                  : 'cursor-zoom-out'
              }`}
              onClick={() =>
                setZoomScale((s) => (s === 1 ? 1.75 : 1))
              }
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
