import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, MapPin, CalendarDays, FileText, ClipboardCheck, AlertTriangle, Camera, ZoomIn, ZoomOut, ExternalLink, GitMerge, Printer } from 'lucide-react'
import { doc, getDoc, collection, onSnapshot, serverTimestamp, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { commitComplaintTransition } from '@/firebase/complaintLifecycle'
import { ResolutionFeedback } from '@/components/citizen/ResolutionFeedback'
import { MilestoneCelebrationBanner } from '@/components/citizen/MilestoneCelebrationBanner'
import { PrintableGrievanceReceipt } from '@/components/citizen/PrintableGrievanceReceipt'
import { ComplaintLocationMap } from '@/components/common/ComplaintLocationMap'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SlaBadge, SlaCountdown } from '@/components/common/SlaBadge'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import { getSlaTargetDate } from '@/utils/sla'
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

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
  'Merged - Duplicate': 'secondary',
}

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

async function resolveCitizenComplaintDocumentId(idOrTrackingCode) {
  if (!idOrTrackingCode) return idOrTrackingCode
  const directSnap = await getDoc(doc(db, 'issues', idOrTrackingCode))
  if (directSnap.exists()) return directSnap.id

  const q = query(
    collection(db, 'issues'),
    where('complaintId', '==', idOrTrackingCode),
    limit(1)
  )
  const querySnap = await getDocs(q)
  if (!querySnap.empty) return querySnap.docs[0].id

  return idOrTrackingCode
}

function canReopenComplaint(complaint) {
  const resolvedAt = complaint.resolvedAt?.toDate?.()
  return complaint.status === 'Resolved' && !!resolvedAt &&
    Date.now() - resolvedAt.getTime() <= REOPEN_WINDOW_MS
}

function sortEvents(list) {
  const getMillis = (val) => {
    if (!val) return 0
    if (typeof val.toMillis === 'function') return val.toMillis()
    if (typeof val.toDate === 'function') return val.toDate().getTime()
    if (typeof val.seconds === 'number') return val.seconds * 1000
    if (typeof val === 'number') return val
    const parsed = new Date(val).getTime()
    return isNaN(parsed) ? 0 : parsed
  }
  return [...list].sort((a, b) => getMillis(a.timestamp) - getMillis(b.timestamp))
}

function formatEventDate(ts) {
  if (!ts) return ''
  let date = null
  if (typeof ts?.toDate === 'function') {
    date = ts.toDate()
  } else if (ts instanceof Date) {
    date = ts
  } else if (typeof ts?.seconds === 'number') {
    date = new Date(ts.seconds * 1000)
  } else if (typeof ts === 'number' || typeof ts === 'string') {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) date = d
  }
  if (!date) return ''
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function ComplaintDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [complaint, setComplaint] = useState(null)
  const [citizen, setCitizen] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [eventsLoadError, setEventsLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const transitionPending = useRef(false)

  useEffect(() => {
    if (!complaint?.reportedBy) return
    if (user?.uid === complaint.reportedBy) {
      setCitizen({
        name: user.name || user.displayName,
        email: user.email,
      })
    }
    let active = true
    getDoc(doc(db, 'users', complaint.reportedBy))
      .then((snap) => {
        if (!active || !snap.exists()) return
        setCitizen((prev) => ({ ...prev, ...snap.data() }))
      })
      .catch(() => {
        // Fallback remains
      })
    return () => {
      active = false
    }
  }, [complaint?.reportedBy, user?.uid, user?.name, user?.displayName, user?.email])

  const handlePrintReceipt = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print()
    }
  }

  useEffect(() => {
    let cancelled = false
    let unsubEvents
    let unsubComplaint

    setLoading(true)
    setNotFound(false)
    setLoadError(false)
    setComplaint(null)
    setEvents([])
    setEventsLoaded(false)
    setEventsLoadError(false)

    const loadComplaint = async () => {
      try {
        const documentId = await resolveCitizenComplaintDocumentId(id)
        if (cancelled) return

        // Replace public tracking IDs with the actual Firestore document ID.
        if (documentId !== id) {
          navigate(`/complaints/${documentId}`, { replace: true })
          return
        }

        // Start the events listener only after resolving the document ID.
        unsubEvents = onSnapshot(
          collection(db, `issues/${documentId}/events`),
          (snap) => {
            if (cancelled) return

            if (snap?.docs) {
              const list = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
              }))
              setEvents(sortEvents(list))
            }
            setEventsLoaded(true)
            setEventsLoadError(false)
          },
          (error) => {
            console.error('ComplaintDetails events Firestore error:', error)
            if (!cancelled) {
              setEventsLoaded(true)
              setEventsLoadError(true)
            }
          },
        )

        // Listen to the verified complaint document.
        unsubComplaint = onSnapshot(
          doc(db, 'issues', documentId),
          (snap) => {
            if (cancelled) return

            if (snap.exists()) {
              setComplaint({ id: snap.id, ...snap.data() })
              setNotFound(false)
            } else {
              setNotFound(true)
            }

            setLoading(false)
          },
          (error) => {
            if (cancelled) return

            console.error('ComplaintDetails Firestore error:', error)
            setLoadError(true)
            setLoading(false)
          },
        )
      } catch (error) {
        if (cancelled) return

        console.error('Error loading complaint:', error)
        setLoadError(true)
        setLoading(false)
      }
    }

    loadComplaint()

    return () => {
      cancelled = true
      unsubEvents?.()
      unsubComplaint?.()
    }
  }, [id, navigate, user?.uid])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Unable to load complaint
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Please check your connection and try again.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
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

  const lastUpdated = complaint.updatedAt?.toDate?.() || complaint.createdAt?.toDate?.()
  const slaTarget = getSlaTargetDate(complaint.createdAt, complaint.category, complaint.department)
  const isOwner = Boolean(user?.uid && complaint?.reportedBy === user?.uid)
  const mergedUids = complaint?.mergedReporters || complaint?.mergedFromUids || []
  const isMergedViewer = Boolean(
    user?.uid &&
    !isOwner &&
    complaint.status !== 'Merged - Duplicate' &&
    Array.isArray(mergedUids) &&
    mergedUids.includes(user?.uid)
  )
  const canReopen = isOwner && canReopenComplaint(complaint)
  const initialPhoto = complaint.imageUrl || complaint.photos?.[0]
  const resolutionPhoto = getResolutionPhoto(complaint)

  const timelineEvents = events.map((evt) => ({
    ...evt,
    formattedDate: formatEventDate(evt.timestamp),
  }))

  const handleReopen = async () => {
    if (transitionPending.current) return
    if (!canReopen) {
      toast.error('This complaint is no longer eligible for reopening')
      return
    }
    const reason = feedback.trim()
    if (!reason) {
      toast.error('Please tell us what is still not fixed')
      return
    }
    transitionPending.current = true
    setSaving(true)
    try {
      await commitComplaintTransition(
        id,
        'Resolved',
        {
          status: 'Reopened',
          reopenReason: reason,
          reopenedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        current => ({
          recipientUid: null,
          recipientRole: 'admin',
          senderUid: user.uid,
          issueId: current.complaintId || id,
          type: 'status_update',
          title: 'Complaint Reopened',
          message: `A citizen reopened a resolved complaint: ${reason}`,
        }),
        canReopenComplaint,
        current => ({
          actorUid: user.uid,
          action: 'Status changed',
          previousStatus: current.status,
          newStatus: 'Reopened',
          remarks: reason,
        })
      )
      toast.success('Complaint reopened')
      setReopenOpen(false)
      setFeedback('')
    } catch (err) {
      toast.error('Failed to reopen complaint')
      console.error(err)
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      {/* Normal screen presentation */}
      <div className="print:hidden">
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
          <MilestoneCelebrationBanner complaint={complaint} />

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(complaint)}</span>
                      <Badge variant={statusVariant[complaint.status] || 'default'} className="capitalize">
                        {complaint.status}
                      </Badge>
                      <SlaBadge complaint={complaint} />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white mt-1">{complaint.title}</h1>
                    {complaint.status === 'Merged - Duplicate' && (
                      <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm dark:border-purple-900/50 dark:bg-purple-900/20">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <GitMerge className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span className="font-medium text-purple-900 dark:text-purple-200">
                              Consolidated with ticket: <span className="font-mono font-semibold">{complaint.mergedInto || 'CMP-XXXX-XXXX'}</span>
                            </span>
                          </div>
                          {(complaint.mergedIntoId || complaint.mergedInto) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1 border-purple-300 dark:border-purple-800 text-purple-700 dark:text-purple-300"
                              onClick={() => navigate(`/complaints/${complaint.mergedIntoId || complaint.mergedInto}`)}
                            >
                              <ExternalLink className="h-3 w-3" /> View Consolidated Ticket
                            </Button>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">
                          This issue was merged with an existing report and is being resolved jointly.
                        </p>
                      </div>
                    )}
                    {isMergedViewer && (
                      <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm dark:border-purple-900/50 dark:bg-purple-900/20">
                        <div className="flex items-center gap-2">
                          <GitMerge className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                          <span className="font-medium text-purple-900 dark:text-purple-200">
                            Primary Consolidated Ticket
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-purple-700 dark:text-purple-300">
                          Your reported issue was consolidated into this primary grievance. Updates and resolution progress on this ticket apply jointly to all merged reports.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handlePrintReceipt}
                    >
                      <Printer className="h-4 w-4" />
                      Print Official Receipt
                    </Button>
                    {canReopen && (
                      <Button size="sm" className="shrink-0" onClick={() => setReopenOpen(true)}>
                        Reopen Issue
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 py-4 border-y border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Category</p>
                    {complaint.category ? (
                      <CategoryAvatar category={complaint.category} size="xs" />
                    ) : (
                      <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">-</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Department</p>
                    <DepartmentCrest
                      department={complaint.department}
                      category={complaint.category}
                      size="xs"
                    />
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
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">SLA Target</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-0.5">
                      {slaTarget
                        ? slaTarget.toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '-'}
                    </p>
                  </div>
                </div>

                <SlaCountdown complaint={complaint} className="mt-4" />

                <div className="mt-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Description</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{complaint.description}</p>
                </div>

                {(initialPhoto || resolutionPhoto) && (
                  <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
                      <Camera className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      Photo Evidence
                    </h3>
                    <div className="relative group inline-block w-full max-w-xl overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
                      <ResolutionProofSlider
                        beforePhoto={initialPhoto}
                        afterPhoto={resolutionPhoto}
                        onImageClick={() => setZoomOpen(true)}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomOpen(true)}
                        className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium cursor-pointer"
                        aria-label="Zoom in on photo evidence"
                      >
                        <ZoomIn className="h-4 w-4" />
                        Click to zoom
                      </button>
                    </div>
                  </div>
                )}

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

                <ComplaintAudioPlayer audioNote={complaint.audioNote} />

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
                {eventsLoadError ? (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Timeline history could not be loaded. Please try again later.
                  </p>
                ) : !eventsLoaded ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Loading timeline history...
                  </p>
                ) : timelineEvents.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Timeline history is unavailable for this complaint.
                  </p>
                ) : (
                  <div className="relative ml-2">
                    <div className="absolute left-[7px] top-1 bottom-1 w-0.5 bg-gray-200 dark:bg-gray-800" />
                    <div className="space-y-6">
                      {timelineEvents.map((evt, i) => (
                        <motion.div
                          key={evt.id || i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: i * 0.08 }}
                          className="relative flex gap-4"
                        >
                          <div className="relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-2 border-primary-600 bg-primary-600 dark:border-primary-400 dark:bg-primary-400">
                            <div className="h-1.5 w-1.5 rounded-full bg-white" />
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                                {evt.action}
                              </p>
                              {evt.formattedDate && (
                                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                                  {evt.formattedDate}
                                </span>
                              )}
                            </div>
                            {evt.previousStatus && evt.newStatus && evt.previousStatus !== evt.newStatus && (
                              <p className="text-xs font-medium text-primary-600 dark:text-primary-400 mt-0.5">
                                {evt.previousStatus} &rarr; {evt.newStatus}
                              </p>
                            )}
                            {evt.remarks && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                                {evt.remarks}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {complaint.status === 'Resolved' && complaint.reportedBy === user?.uid && (
            <Card>
              <CardHeader>
                <CardTitle>Resolution feedback</CardTitle>
                <CardDescription>Tell us how the work went.</CardDescription>
              </CardHeader>
              <CardContent>
                <ResolutionFeedback key={id} issueId={id} title={complaint.title} feedback={complaint.feedback} />
              </CardContent>
            </Card>
          )}
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
                        <DepartmentCrest
                          department={complaint.department}
                          category={complaint.category}
                          size="xs"
                        />
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
                <ComplaintLocationMap latitude={complaint.latitude} longitude={complaint.longitude} address={complaint.address} height="240px" />
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

      {/* Photo Evidence Zoom Modal */}
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
              <DialogTitle>Photo Evidence</DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 px-1 py-0.5 text-xs">
                  <button
                    type="button"
                    disabled={zoomScale <= 0.75}
                    onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40"
                    title="Zoom out"
                    aria-label="Zoom out"
                  >
                    <ZoomOut className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomScale(1)}
                    className="px-1.5 py-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-mono text-[11px] text-gray-700 dark:text-gray-300"
                    title="Reset zoom"
                    aria-label="Reset zoom"
                  >
                    {Math.round(zoomScale * 100)}%
                  </button>
                  <button
                    type="button"
                    disabled={zoomScale >= 3}
                    onClick={() => setZoomScale((s) => Math.min(3, s + 0.25))}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-40"
                    title="Zoom in"
                    aria-label="Zoom in"
                  >
                    <ZoomIn className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
                  </button>
                </div>

                {(initialPhoto || resolutionPhoto) && (
                  <a
                    href={initialPhoto || resolutionPhoto}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-normal text-primary-600 dark:text-primary-400 hover:underline ml-1"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open original
                  </a>
                )}
              </div>
            </div>
            <DialogDescription>
              Visual proof attached to {getDisplayId(complaint)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[70vh] overflow-auto rounded-lg bg-black/5 dark:bg-black/40 p-2">
            <img
              src={initialPhoto || resolutionPhoto}
              alt="Enlarged complaint evidence"
              style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}
              className={`max-h-[65vh] w-auto max-w-full object-contain rounded-md transition-transform duration-150 ${
                zoomScale === 1 ? 'cursor-zoom-in' : 'cursor-zoom-out'
              }`}
              onClick={() => setZoomScale((s) => (s === 1 ? 1.75 : 1))}
            />
          </div>
        </DialogContent>
      </Dialog>
      </div>

      {/* Dedicated print container */}
      <div className="hidden print:block print:w-full printable-receipt-wrapper">
        <PrintableGrievanceReceipt
          complaint={complaint}
          citizen={citizen}
          user={user}
        />
      </div>
    </div>
  )
}