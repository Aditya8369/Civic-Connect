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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  UserCheck,
  AlertCircle,
  MessageSquare,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Upload,
  Lock,
  Unlock,
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
import { logComplaintEvent, sortEvents } from '@/firebase/complaintEvents'
import { getDisplayId, ensureComplaintId } from '@/firebase/complaintId'
import {
  commitComplaintTransition,
  dispatchComplaintToOfficer,
  submitResolutionForVerification,
  reviewComplaintDispute,
} from '@/firebase/complaintLifecycle'
import { uploadResolutionProof } from '@/firebase/storage'
import { assignComplaintDepartment } from '@/firebase/complaintDepartment'
import { mergeComplaints } from '@/firebase/complaintMerge'
import { loadResolutionTemplates } from '@/firebase/resolutionTemplates'
import { fetchOfficerCandidates, rankCandidateOfficers } from '@/firebase/officerDispatch'
import { applyRetentionHold, releaseRetentionHold } from '@/firebase/evidenceRetention'
import EvidenceTombstone from '@/components/common/EvidenceTombstone'
import { ComplaintAuditTimeline } from '@/components/admin/ComplaintAuditTimeline'
import { ResolutionChatDrawer } from '@/components/chat/ResolutionChatDrawer'
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
  'Pending Verification': 'warning',
  Disputed: 'destructive',
  'Merged - Duplicate': 'secondary',
}

const statusTranslationKeys = {
  Resolved: 'statusResolved',
  'In Progress': 'statusInProgress',
  Pending: 'statusPending',
  Rejected: 'statusRejected',
  Reopened: 'statusReopened',
  'Pending Verification': 'statusPendingVerification',
  Disputed: 'statusDisputed',
  'Merged - Duplicate': 'statusMerged',
}

const nextStatus = {
  Pending: 'In Progress',
  'In Progress': 'Pending Verification',
  Reopened: 'In Progress',
  'Pending Verification': null,
  Disputed: null,
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
      className={`absolute inset-0 h-full w-full object-cover ${onClick ? 'cursor-pointer' : ''
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
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false)

  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomScale, setZoomScale] = useState(1)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [candidateComplaints, setCandidateComplaints] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedParentId, setSelectedParentId] = useState('')
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [merging, setMerging] = useState(false)

  // Resolution Proof Submission States (#253)
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false)
  const [resolutionModalNotes, setResolutionModalNotes] = useState('')
  const [resolutionProofFile, setResolutionProofFile] = useState(null)
  const [resolutionProofPreview, setResolutionProofPreview] = useState(null)
  const resolutionFileInputRef = useRef(null)

  // Dispute Review States (#253)
  const [disputeReviewDialogOpen, setDisputeReviewDialogOpen] = useState(false)
  const [disputeDecision, setDisputeDecision] = useState('UPHOLD_DISPUTE') // 'UPHOLD_DISPUTE' | 'REJECT_DISPUTE'
  const [disputeAdminRemarks, setDisputeAdminRemarks] = useState('')

  // Evidence Retention Hold States (#283)
  const [holdModalOpen, setHoldModalOpen] = useState(false)
  const [holdReason, setHoldReason] = useState('')
  const [holdNotes, setHoldNotes] = useState('')

  const handleApplyRetentionHold = async () => {
    if (!holdReason.trim()) {
      toast.error('Please specify a justification for the retention hold.')
      return
    }
    setSaving(true)
    try {
      await applyRetentionHold(
        id,
        { reason: holdReason, notes: holdNotes },
        user
      )
      toast.success('Evidence retention hold applied successfully')
      setHoldModalOpen(false)
      setHoldReason('')
      setHoldNotes('')
    } catch (err) {
      console.error('Apply retention hold error:', err)
      toast.error(err.message || 'Failed to apply retention hold')
    } finally {
      setSaving(false)
    }
  }

  const handleReleaseRetentionHold = async () => {
    const reason = window.prompt('Please enter the reason for releasing this retention hold:')
    if (!reason || !reason.trim()) return

    setSaving(true)
    try {
      await releaseRetentionHold(
        id,
        { reason },
        user
      )
      toast.success('Retention hold released successfully')
    } catch (err) {
      console.error('Release retention hold error:', err)
      toast.error(err.message || 'Failed to release retention hold')
    } finally {
      setSaving(false)
    }
  }

  // Intelligent Dispatch Assistant state
  const [officerCandidates, setOfficerCandidates] = useState([])
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchError, setDispatchError] = useState(null)
  const [selectedOfficer, setSelectedOfficer] = useState(null)
  const [dispatching, setDispatching] = useState(false)
  const [expandedOfficerId, setExpandedOfficerId] = useState(null)

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

    // If moving from In Progress to Pending Verification, intercept and open the proof submission modal
    if (next === 'Pending Verification') {
      setResolutionModalNotes(resolutionNotes || complaint.resolutionNotes || '')
      setResolutionModalOpen(true)
      return
    }

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

  const handleResolutionPhotoSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setResolutionProofFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      setResolutionProofPreview(event.target?.result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitResolutionVerification = async () => {
    if (saving || transitionPending.current) return

    const notes = resolutionModalNotes.trim()
    if (!notes) {
      toast.error('Resolution notes are required')
      return
    }

    if (!resolutionProofFile) {
      toast.error('Resolution proof photo is required to submit for verification')
      return
    }

    transitionPending.current = true
    setSaving(true)
    try {
      const proofArtifact = await uploadResolutionProof(resolutionProofFile, id)
      await submitResolutionForVerification(
        id,
        {
          resolutionNotes: notes,
          resolutionProof: proofArtifact,
        },
        { uid: actorUid, role: 'admin' }
      )

      toast.success('Resolution submitted for citizen verification')
      setResolutionModalOpen(false)
      setResolutionProofFile(null)
      setResolutionProofPreview(null)
      setResolutionModalNotes('')
    } catch (err) {
      console.error('Submit resolution verification error:', err)
      toast.error(err.message || 'Failed to submit resolution proof')
    } finally {
      transitionPending.current = false
      setSaving(false)
    }
  }

  const handleReviewDispute = async () => {
    if (saving || transitionPending.current) return

    const remarks = disputeAdminRemarks.trim()
    if (!remarks) {
      toast.error('Admin review remarks are required')
      return
    }

    transitionPending.current = true
    setSaving(true)
    try {
      await reviewComplaintDispute(
        id,
        {
          decision: disputeDecision,
          remarks,
        },
        { uid: actorUid, role: 'admin' }
      )

      toast.success(
        disputeDecision === 'UPHOLD_DISPUTE'
          ? 'Dispute upheld. Complaint returned to In Progress.'
          : 'Dispute overruled. Complaint marked Resolved.'
      )
      setDisputeReviewDialogOpen(false)
      setDisputeAdminRemarks('')
    } catch (err) {
      console.error('Dispute review error:', err)
      toast.error(err.message || 'Failed to review dispute')
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

  // Fetch candidate officers for intelligent dispatch assistant
  useEffect(() => {
    let active = true
    if (!complaint) return

    setDispatchLoading(true)
    setDispatchError(null)

    fetchOfficerCandidates()
      .then((officers) => {
        if (!active) return
        setOfficerCandidates(officers)
        setDispatchLoading(false)
      })
      .catch((err) => {
        if (!active) return
        console.error('Failed to load candidate officers:', err)
        setDispatchError('Unable to load field officer directory')
        setDispatchLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, complaint?.department, complaint?.category, complaint])

  // Ranked recommendations derived from current complaint & officers
  const dispatchRankings = rankCandidateOfficers(officerCandidates, complaint)

  const handleConfirmDispatch = async () => {
    if (!selectedOfficer) {
      toast.error('Select an eligible officer to dispatch')
      return
    }

    if (dispatching) return
    setDispatching(true)

    try {
      await dispatchComplaintToOfficer(id, selectedOfficer.officerId, authUser, {
        remarks: `Dispatched to ${selectedOfficer.name} (Match Score: ${selectedOfficer.score}%)`,
      })

      toast.success(`Complaint dispatched to ${selectedOfficer.name}!`)
      setSelectedOfficer(null)
      // Refresh officer list to display updated live active workload
      const updatedOfficers = await fetchOfficerCandidates()
      setOfficerCandidates(updatedOfficers)
    } catch (err) {
      console.error('Dispatch transaction failed:', err)
      toast.error(err?.message || 'Failed to dispatch officer. Please try again.')
    } finally {
      setDispatching(false)
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
  const isEvidenceErased =
    complaint.evidenceErased === true ||
    complaint.photos?.[0]?.tombstone === true ||
    complaint.imageTombstone?.tombstone === true
  const rawInitialPhoto = complaint.imageUrl || complaint.photos?.[0]
  const initialPhoto =
    rawInitialPhoto && typeof rawInitialPhoto === 'object' && rawInitialPhoto.tombstone
      ? null
      : typeof rawInitialPhoto === 'string'
      ? rawInitialPhoto
      : rawInitialPhoto?.downloadUrl || rawInitialPhoto?.url || null
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
                                  `/admin/reports/${complaint.mergedIntoId ||
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
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="admin-resolution-chat-btn"
                    className="gap-1.5 border-primary-300 text-primary-700 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-300"
                    onClick={() => setIsChatDrawerOpen(true)}
                  >
                    <MessageSquare className="h-4 w-4 text-primary-600" />
                    Resolution Chat
                  </Button>
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

                  {complaint.status === 'Disputed' && (
                    <Button
                      onClick={() => setDisputeReviewDialogOpen(true)}
                      disabled={saving || merging}
                      size="sm"
                      className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Review Citizen Dispute
                    </Button>
                  )}

                  {['Resolved', 'Rejected', 'Merged - Duplicate'].includes(complaint.status) &&
                    !complaint.retentionHold?.active &&
                    !complaint.evidenceErased && (
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="apply-retention-hold-btn"
                        onClick={() => setHoldModalOpen(true)}
                        disabled={saving || merging}
                        className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                      >
                        <Lock className="h-4 w-4" />
                        Apply Retention Hold
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

              {/* Active Retention Hold Banner (#283) */}
              {complaint.retentionHold?.active === true && (
                <div
                  data-testid="retention-hold-banner"
                  className="mt-6 rounded-xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-700/60 dark:bg-amber-950/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full bg-amber-100 p-1.5 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                        <Lock className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                            Active Evidence Retention Hold
                          </h4>
                          <Badge variant="warning" className="text-[10px] uppercase font-bold tracking-wider">
                            Ineligible for Erasure
                          </Badge>
                        </div>
                        <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                          Reason: {complaint.retentionHold.reason}{' '}
                          {complaint.retentionHold.holdId ? `(${complaint.retentionHold.holdId})` : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="release-retention-hold-btn"
                      onClick={handleReleaseRetentionHold}
                      disabled={saving}
                      className="gap-1.5 border-amber-300 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200"
                    >
                      <Unlock className="h-4 w-4" />
                      Release Hold
                    </Button>
                  </div>
                </div>
              )}

              {/* Issue #253: 3-Way Evidence Comparison & Dispute Review Banner */}
              {complaint.status === 'Disputed' && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50/50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-red-100 p-1.5 text-red-700 dark:bg-red-900/60 dark:text-red-300">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-red-900 dark:text-red-200">
                          Citizen Dispute Escalation Under Review
                        </h4>
                        <p className="text-xs text-red-700 dark:text-red-300">
                          Citizen has rejected the field officer's resolution. Compare the 3-way visual evidence below to decide.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setDisputeReviewDialogOpen(true)}
                      className="gap-1.5 bg-red-600 hover:bg-red-700 text-white shrink-0"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Take Dispute Decision
                    </Button>
                  </div>

                  {complaint.dispute && (
                    <div className="mt-4 rounded-lg border border-red-200 bg-white p-3.5 text-xs dark:border-red-900/40 dark:bg-gray-900">
                      <p className="font-semibold text-red-900 dark:text-red-200">
                        Citizen Dispute Reason: <span className="font-mono font-medium">{complaint.dispute.reason}</span>
                      </p>
                      <p className="mt-1 text-gray-700 dark:text-gray-300 leading-relaxed">
                        {complaint.dispute.explanation}
                      </p>
                      {complaint.dispute.evidence?.some(e => e.contentType?.startsWith('audio/')) && (
                        <div className="mt-2.5">
                          <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Dispute Voice Recording:</p>
                          <ComplaintAudioPlayer audioNote={complaint.dispute.evidence.find(e => e.contentType?.startsWith('audio/'))} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3-Way Evidence Comparison Grid */}
                  <div className="mt-4">
                    <h5 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                      3-Way Evidence Comparison
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* 1. Initial Citizen Photo */}
                      <div className="rounded-lg border border-gray-200 bg-white p-2 text-center dark:border-gray-800 dark:bg-gray-900">
                        <span className="text-[11px] font-semibold text-gray-500 uppercase">1. Citizen Initial Photo</span>
                        <div className="mt-1 h-36 w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          {initialPhoto ? (
                            <img src={initialPhoto} alt="Initial grievance evidence" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400">No initial photo</span>
                          )}
                        </div>
                      </div>

                      {/* 2. Officer Resolution Photo */}
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 text-center dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase">2. Officer Resolution Proof</span>
                        <div className="mt-1 h-36 w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          {resolutionPhoto ? (
                            <img src={resolutionPhoto} alt="Officer resolution proof" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-xs text-gray-400">No resolution photo</span>
                          )}
                        </div>
                      </div>

                      {/* 3. Citizen Dispute Photo */}
                      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-2 text-center dark:border-rose-900/40 dark:bg-rose-950/20">
                        <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 uppercase">3. Citizen Dispute Photo</span>
                        <div className="mt-1 h-36 w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          {complaint.dispute?.evidence?.find(e => e.contentType?.startsWith('image/'))?.downloadUrl ? (
                            <img
                              src={complaint.dispute.evidence.find(e => e.contentType?.startsWith('image/')).downloadUrl}
                              alt="Citizen dispute evidence"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">No dispute photo</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pending Verification Notice */}
              {complaint.status === 'Pending Verification' && (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                        Awaiting Citizen Verification
                      </h4>
                      <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90">
                        Resolution proof has been submitted. The citizen has a 5-day review window to verify or dispute.
                        If no action is taken within the window, the system automatically resolves the complaint.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <SlaCountdown complaint={complaint} className="mt-4" />

              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {t('description')}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {complaint.description}
                </p>
              </div>

              {isEvidenceErased ? (
                <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <EvidenceTombstone
                    erasedAt={complaint.evidenceErasedAt}
                    policyVersion={complaint.retentionPolicyVersion}
                  />
                </div>
              ) : (initialPhoto || resolutionPhoto) ? (
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
              ) : null}

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
                        className={`h-5 w-5 ${s <= complaint.feedback.rating
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

          {/* Intelligent Field Officer Dispatch Assistant */}
          <Card className="border-indigo-100 dark:border-indigo-950/60 shadow-sm" data-testid="dispatch-assistant-card">
            <CardHeader className="pb-3 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border-b border-indigo-100/60 dark:border-indigo-900/30">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base text-indigo-950 dark:text-indigo-200">
                  <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  Intelligent Dispatch Assistant
                </CardTitle>
                <Badge variant="outline" className="bg-white/80 dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 text-[11px]">
                  Multi-Factor AI
                </Badge>
              </div>
              <CardDescription className="text-xs text-indigo-900/70 dark:text-indigo-300/70">
                Workload, proximity, specialization, and SLA-aware recommendations
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-4 space-y-3">
              {dispatchLoading ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2" role="status" aria-label="Loading recommendations">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                  <span className="text-xs text-gray-500">Evaluating candidates…</span>
                </div>
              ) : dispatchError ? (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300 flex items-start gap-2" role="alert">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{dispatchError}</span>
                </div>
              ) : dispatchRankings.recommendations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-800 p-4 text-center space-y-1">
                  <UserCheck className="h-6 w-6 text-gray-400 mx-auto" />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">No Eligible Officers Available</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    All candidates are currently inactive, at maximum capacity, or unassigned. Use manual assignment below.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs text-gray-500 font-medium px-1">
                    <span>Recommended Candidates</span>
                    <span>Match Score</span>
                  </div>

                  {dispatchRankings.recommendations.map((candidate, idx) => {
                    const isSelected = selectedOfficer?.officerId === candidate.officerId
                    const isExpanded = expandedOfficerId === candidate.officerId

                    return (
                      <div
                        key={candidate.officerId}
                        data-testid={`candidate-card-${candidate.officerId}`}
                        className={`rounded-lg border transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900'
                        }`}
                      >
                        <div
                          className="p-3 cursor-pointer flex items-start justify-between gap-2"
                          onClick={() => setSelectedOfficer(isSelected ? null : candidate)}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {candidate.name}
                              </span>
                              {idx === 0 && (
                                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                                  Top Match
                                </Badge>
                              )}
                            </div>

                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {candidate.department || 'General Operations'} • {candidate.activeCount}/{candidate.maxCapacity} active
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                {candidate.score}%
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setExpandedOfficerId(isExpanded ? null : candidate.officerId)
                              }}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
                              title={isExpanded ? 'Collapse breakdown' : 'Expand score breakdown'}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Explainable factor breakdown */}
                        {isExpanded && (
                          <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2 text-[11px] bg-gray-50/50 dark:bg-gray-950/30 rounded-b-lg">
                            <p className="font-semibold text-gray-700 dark:text-gray-300 text-[10px] uppercase tracking-wider">
                              Scoring Factor Breakdown
                            </p>

                            <div className="grid grid-cols-1 gap-1.5">
                              <div className="flex items-start justify-between gap-1">
                                <span className="text-gray-600 dark:text-gray-400">Workload:</span>
                                <span className="font-medium text-gray-900 dark:text-gray-200 text-right">
                                  {candidate.breakdown.workload.score}/100 ({candidate.breakdown.workload.explanation})
                                </span>
                              </div>

                              <div className="flex items-start justify-between gap-1">
                                <span className="text-gray-600 dark:text-gray-400">Proximity:</span>
                                <span className="font-medium text-gray-900 dark:text-gray-200 text-right">
                                  {candidate.breakdown.proximity.score}/100 ({candidate.breakdown.proximity.explanation})
                                </span>
                              </div>

                              <div className="flex items-start justify-between gap-1">
                                <span className="text-gray-600 dark:text-gray-400">Specialization:</span>
                                <span className="font-medium text-gray-900 dark:text-gray-200 text-right">
                                  {candidate.breakdown.specialization.score}/100 ({candidate.breakdown.specialization.explanation})
                                </span>
                              </div>

                              <div className="flex items-start justify-between gap-1">
                                <span className="text-gray-600 dark:text-gray-400">SLA Record:</span>
                                <span className="font-medium text-gray-900 dark:text-gray-200 text-right">
                                  {candidate.breakdown.sla.score}/100 ({candidate.breakdown.sla.explanation})
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {selectedOfficer && (
                    <div className="pt-2">
                      <Button
                        className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
                        disabled={dispatching}
                        onClick={handleConfirmDispatch}
                        data-testid="confirm-dispatch-button"
                      >
                        {dispatching ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Confirm Dispatch to {selectedOfficer.name} ({selectedOfficer.score}%)
                      </Button>
                    </div>
                  )}
                </div>
              )}
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
                        className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${isSelected
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
              className={`max-h-[65vh] w-auto max-w-full rounded-md object-contain transition-transform duration-150 ${zoomScale === 1
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

      {/* Resolution Proof Submission Modal (#253) */}
      <Dialog open={resolutionModalOpen} onOpenChange={setResolutionModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Submit Work Resolution for Citizen Verification</DialogTitle>
            <DialogDescription>
              Upload mandatory visual proof showing the finished repairs/resolution before submitting this issue to the citizen for verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="resolution-modal-notes" className="text-xs font-semibold">
                Work Resolution Notes <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="resolution-modal-notes"
                rows={3}
                value={resolutionModalNotes}
                onChange={(e) => setResolutionModalNotes(e.target.value)}
                placeholder="Describe the corrective actions taken to resolve the grievance..."
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">
                Resolution Proof Photo (Mandatory) <span className="text-red-500">*</span>
              </Label>
              <input
                ref={resolutionFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg"
                className="hidden"
                onChange={handleResolutionPhotoSelect}
                disabled={saving}
              />
              {!resolutionProofPreview ? (
                <button
                  type="button"
                  onClick={() => resolutionFileInputRef.current?.click()}
                  disabled={saving}
                  className="mt-1 w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:border-primary-500 transition-colors"
                >
                  <Upload className="h-6 w-6 text-gray-400 mb-1" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Upload after-completion photo
                  </span>
                  <span className="text-xs text-gray-400 mt-0.5">JPG or PNG up to 5MB</span>
                </button>
              ) : (
                <div className="mt-2 relative inline-block">
                  <img
                    src={resolutionProofPreview}
                    alt="Resolution proof preview"
                    className="h-32 w-44 rounded-md object-cover border border-gray-200 dark:border-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setResolutionProofFile(null)
                      setResolutionProofPreview(null)
                    }}
                    className="absolute -top-2 -right-2 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-700"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolutionModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResolutionVerification}
              disabled={saving || !resolutionModalNotes.trim() || !resolutionProofFile}
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Submit for Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Dispute Review Dialog (#253) */}
      <Dialog open={disputeReviewDialogOpen} onOpenChange={setDisputeReviewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Admin Review of Citizen Dispute</DialogTitle>
            <DialogDescription>
              Evaluate the dispute evidence submitted by the citizen against the officer's resolution proof and issue an authoritative ruling.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Review Outcome Decision <span className="text-red-500">*</span></Label>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDisputeDecision('UPHOLD_DISPUTE')}
                  className={`p-3 rounded-lg border text-left transition-all ${disputeDecision === 'UPHOLD_DISPUTE'
                    ? 'border-red-500 bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-200 ring-2 ring-red-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                  <p className="font-semibold text-xs text-red-700 dark:text-red-300">Uphold Dispute</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Citizen is correct. Return ticket to In Progress for rework.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setDisputeDecision('REJECT_DISPUTE')}
                  className={`p-3 rounded-lg border text-left transition-all ${disputeDecision === 'REJECT_DISPUTE'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                >
                  <p className="font-semibold text-xs text-emerald-700 dark:text-emerald-300">Overrule / Reject Dispute</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Resolution meets standards. Mark ticket permanently Resolved.</p>
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="dispute-admin-remarks" className="text-xs font-semibold">
                Administrative Remarks <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="dispute-admin-remarks"
                rows={3}
                value={disputeAdminRemarks}
                onChange={(e) => setDisputeAdminRemarks(e.target.value)}
                placeholder="State the administrative finding and instructions..."
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisputeReviewDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReviewDispute}
              disabled={saving || !disputeAdminRemarks.trim()}
              className={disputeDecision === 'UPHOLD_DISPUTE' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Confirm Ruling
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retention Hold Dialog (#283) */}
      <Dialog open={holdModalOpen} onOpenChange={setHoldModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600" />
              Apply Evidence Retention Hold
            </DialogTitle>
            <DialogDescription>
              Applying a retention hold exempts this grievance's evidence from automated data retention cleanup schedules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="hold-reason" className="text-xs font-semibold">
                Hold Justification Reason *
              </Label>
              <Input
                id="hold-reason"
                placeholder="e.g., Pending legal inquiry, municipal litigation audit..."
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="hold-notes" className="text-xs font-semibold">
                Additional Notes (Optional)
              </Label>
              <Input
                id="hold-notes"
                placeholder="Reference case or docket numbers..."
                value={holdNotes}
                onChange={(e) => setHoldNotes(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHoldModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApplyRetentionHold}
              disabled={saving || !holdReason.trim()}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResolutionChatDrawer
        isOpen={isChatDrawerOpen}
        onClose={() => setIsChatDrawerOpen(false)}
        complaint={complaint}
        currentUser={authUser}
      />
    </div>
  )
}
