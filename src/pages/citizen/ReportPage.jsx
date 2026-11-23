
import { saveOfflineComplaint } from '@/utils/offlineQueue'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Send, AlertTriangle, ExternalLink, ThumbsUp, Check,
  Loader2, Clock, Camera, Trash2,
} from 'lucide-react'
import {
  collection, doc, runTransaction, serverTimestamp, query, where, getDocs,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { endorseComplaint } from '@/firebase/endorseComplaint'
import { allocateComplaintId, getDisplayId } from '@/firebase/complaintId'
import { addNotificationToBatch } from '@/firebase/notifications'
import { addComplaintEventToBatch } from '@/firebase/complaintEvents'
import {
  validateComplaintPhoto,
  uploadComplaintPhoto,
  uploadComplaintAudio,
  deleteComplaintEvidence,
} from '@/firebase/storage'
import VoiceRecorder from '@/components/citizen/VoiceRecorder'
import { AITriageCard } from '@/components/citizen/AITriageCard'
import { analyzeComplaintPhoto } from '@/utils/aiTriage'
import {
  buildOCRSuggestions,
  cleanOCRText,
  extractTextFromImage,
  terminateWorker,
} from '@/utils/ocr'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { findNearbyComplaints, parseCoordinates, findWardForCoordinates } from '@/utils/geo'
import { ComplaintLocationMap } from '@/components/common/ComplaintLocationMap'
import { sanitizeText, sanitizeMarkdown } from '@/utils/sanitize'
import toast from 'react-hot-toast'

const categories = [
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

const categoryTranslationKeys = {
  'Potholes & Road Damage': 'categoryPotholes',
  'Streetlight Issues': 'categoryStreetlights',
  'Water Leakage': 'categoryWater',
  'Garbage & Sanitation': 'categoryGarbage',
  'Noise Pollution': 'categoryNoise',
  'Illegal Construction': 'categoryConstruction',
  'Traffic Issues': 'categoryTraffic',
  Other: 'categoryOther',
}

const statusTranslationKeys = {
  Resolved: 'statusResolved',
  'In Progress': 'statusInProgress',
  Pending: 'statusPending',
  'Merged - Duplicate': 'statusMerged',
}

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  'Merged - Duplicate': 'secondary',
}

const COOLDOWN_SECONDS = 60
const COOLDOWN_STORAGE_KEY = 'civic_report_last_submitted_at'

let inMemoryLastSubmittedAt = 0

function getRemainingCooldown(uid) {
  let timestamp = inMemoryLastSubmittedAt
  try {
    const key = uid ? `${COOLDOWN_STORAGE_KEY}_${uid}` : COOLDOWN_STORAGE_KEY
    const stored = localStorage.getItem(key) || localStorage.getItem(COOLDOWN_STORAGE_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed) && parsed > timestamp) timestamp = parsed
    }
  } catch {
    // localStorage might be unavailable or restricted
  }

  if (!timestamp) return 0
  const elapsed = Math.floor((Date.now() - timestamp) / 1000)
  const remaining = COOLDOWN_SECONDS - elapsed
  return remaining > 0 ? remaining : 0
}

function recordSubmissionTimestamp(uid, time = Date.now()) {
  inMemoryLastSubmittedAt = time
  try {
    localStorage.setItem(COOLDOWN_STORAGE_KEY, String(time))
    if (uid) localStorage.setItem(`${COOLDOWN_STORAGE_KEY}_${uid}`, String(time))
  } catch {
    // LocalStorage fallback handled by inMemoryLastSubmittedAt
  }
}

export function ReportPage() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [coordinateError, setCoordinateError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isSubmittingRef = useRef(false)
  const [cooldownRemaining, setCooldownRemaining] = useState(
    () => getRemainingCooldown(user?.uid)
  )

  useEffect(() => {
    if (cooldownRemaining <= 0) return

    const timer = setInterval(() => {
      setCooldownRemaining(getRemainingCooldown(user?.uid))
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldownRemaining, user?.uid])

  useEffect(() => {
    const handleStorageOrFocus = (e) => {
      if (
        !e ||
        !e.key ||
        e.key === COOLDOWN_STORAGE_KEY ||
        (user?.uid && e.key === `${COOLDOWN_STORAGE_KEY}_${user.uid}`)
      ) {
        setCooldownRemaining(getRemainingCooldown(user?.uid))
      }
    }

    window.addEventListener('storage', handleStorageOrFocus)
    window.addEventListener('focus', handleStorageOrFocus)

    return () => {
      window.removeEventListener('storage', handleStorageOrFocus)
      window.removeEventListener('focus', handleStorageOrFocus)
    }
  }, [user?.uid])

  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const [ocrAttempted, setOcrAttempted] = useState(false)
  const ocrRequestId = useRef(0)
  const fileInputRef = useRef(null)
  const addressInputRef = useRef(null)
  const titleInputRef = useRef(null)
  const [voiceNote, setVoiceNote] = useState(null)

  // AI Multimodal Vision Triage state
  const [aiTriageResult, setAiTriageResult] = useState(null)
  const [aiTriageRunning, setAiTriageRunning] = useState(false)
  const [triageSeverity, setTriageSeverity] = useState(null)
  const [aiAutoPopulated, setAiAutoPopulated] = useState(false)
  const triageRequestId = useRef(0)

  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [nearbyDuplicates, setNearbyDuplicates] = useState([])
  const [hasAcknowledgedDuplicate, setHasAcknowledgedDuplicate] = useState(false)
  const [endorsingMap, setEndorsingMap] = useState({})
  const pendingEndorsements = useRef(new Set())
  const lastCheckRequestId = useRef(0)

  const [resolvedJurisdiction, setResolvedJurisdiction] = useState(null)
  const [jurisdictionState, setJurisdictionState] = useState('idle') // 'idle' | 'detecting' | 'resolved' | 'out_of_bounds' | 'invalid'
  const locationRequestIdRef = useRef(0)

  useEffect(() => {
    const currentRequestId = ++locationRequestIdRef.current

    if (!latitude && !longitude) {
      setResolvedJurisdiction(null)
      setJurisdictionState('idle')
      return
    }

    setJurisdictionState('detecting')

    const timer = setTimeout(() => {
      if (locationRequestIdRef.current !== currentRequestId) return

      const coords = parseCoordinates({ latitude, longitude })
      if (!coords) {
        setResolvedJurisdiction(null)
        setJurisdictionState('invalid')
        return
      }

      const ward = findWardForCoordinates(coords)
      if (ward) {
        setResolvedJurisdiction(ward)
        setJurisdictionState('resolved')
      } else {
        setResolvedJurisdiction(null)
        setJurisdictionState('out_of_bounds')
      }
    }, 150)

    return () => {
      clearTimeout(timer)
    }
  }, [latitude, longitude])

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  // Release the shared OCR worker when leaving the report page so its model
  // and wasm memory do not stay resident for the rest of the session.
  useEffect(() => {
    return () => {
      void terminateWorker()
    }
  }, [])

  const runOCRExtraction = useCallback(async (file) => {
    if (!file) return ''

    const requestId = ocrRequestId.current + 1
    ocrRequestId.current = requestId
    setOcrRunning(true)
    setOcrAttempted(true)
    setOcrText('')

    let extractedText = ''
    try {
      const text = await extractTextFromImage(file)
      extractedText = typeof text === 'string' ? text : ''
    } catch (err) {
      // OCR is an optional convenience; never let it interrupt reporting.
      console.error('OCR extraction failed:', err)
    }

    // A newer photo was selected, or the photo was removed while this scan ran.
    if (ocrRequestId.current !== requestId) return extractedText

    const cleaned = cleanOCRText(extractedText)
    setOcrText(cleaned)
    setOcrRunning(false)

    // Only suggest the text here. The citizen decides whether to apply it to
    // the title or address using the buttons in the suggestion panel.
    return extractedText
  }, [])

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateComplaintPhoto(file)
    if (!validation.valid) {
      toast.error(validation.error)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setOcrText('')
    setOcrAttempted(false)

    // Kick off AI multimodal vision triage
    const currentTriageId = ++triageRequestId.current
    setAiTriageRunning(true)
    setAiTriageResult(null)
    setAiAutoPopulated(false)

    analyzeComplaintPhoto(file)
      .then((triage) => {
        if (triageRequestId.current !== currentTriageId) return
        setAiTriageRunning(false)
        if (!triage) return
        setAiTriageResult(triage)
        setTriageSeverity(triage.severity || 'Medium')

        let populated = false
        setCategory((prevCat) => {
          if (!prevCat && triage.category) {
            populated = true
            return triage.category
          }
          return prevCat
        })
        setTitle((prevTitle) => {
          if (!prevTitle?.trim() && triage.suggestedTitle) {
            populated = true
            return triage.suggestedTitle
          }
          return prevTitle
        })
        setDescription((prevDesc) => {
          if (!prevDesc?.trim() && triage.suggestedDescription) {
            populated = true
            return triage.suggestedDescription
          }
          return prevDesc
        })
        if (populated) {
          setAiAutoPopulated(true)
        }
      })
      .catch((err) => {
        console.error('AI triage failed:', err)
        if (triageRequestId.current === currentTriageId) {
          setAiTriageRunning(false)
        }
      })

    // Kick off OCR immediately so a suggestion is ready after upload.
    await runOCRExtraction(file)
  }

  const handleRemovePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    setAiTriageResult(null)
    setAiTriageRunning(false)
    setTriageSeverity(null)
    setAiAutoPopulated(false)
    triageRequestId.current++
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleAcceptAllTriage = () => {
    if (!aiTriageResult) return
    if (aiTriageResult.category) setCategory(aiTriageResult.category)
    if (aiTriageResult.suggestedTitle) setTitle(aiTriageResult.suggestedTitle)
    if (aiTriageResult.suggestedDescription) setDescription(aiTriageResult.suggestedDescription)
    if (aiTriageResult.severity) setTriageSeverity(aiTriageResult.severity)
    setAiAutoPopulated(true)
    toast.success('AI recommendations applied')
  }

  const handleApplyTriageCategory = () => {
    if (!aiTriageResult?.category) return
    setCategory(aiTriageResult.category)
    toast.success(`Category updated to ${aiTriageResult.category}`)
  }

  const handleApplyTriageTitle = () => {
    if (!aiTriageResult?.suggestedTitle) return
    setTitle(aiTriageResult.suggestedTitle)
    toast.success('Title updated')
  }

  const handleApplyTriageDescription = () => {
    if (!aiTriageResult?.suggestedDescription) return
    setDescription(aiTriageResult.suggestedDescription)
    toast.success('Description updated')
  }

  const handleDismissTriage = () => {
    setAiTriageResult(null)
    setAiAutoPopulated(false)
  }

  const extractOCRSuggestion = () => {
    if (!photoFile || ocrRunning) return Promise.resolve('')
    return runOCRExtraction(photoFile)
  }

  const checkDuplicates = useCallback(async (cat, lat, lng) => {
    const coords = parseCoordinates({ latitude: lat, longitude: lng })
    if (!cat || !coords) {
      setNearbyDuplicates([])
      return []
    }

    const currentRequestId = ++lastCheckRequestId.current
    setCheckingDuplicates(true)

    try {
      const q = query(collection(db, 'issues'), where('category', '==', cat))
      const snap = await getDocs(q)

      if (currentRequestId !== lastCheckRequestId.current) return []

      const activeComplaints = []
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        if (data.status !== 'Resolved') {
          activeComplaints.push({ id: docSnap.id, ...data })
        }
      })

      const matches = findNearbyComplaints(coords, activeComplaints, 50)
      setNearbyDuplicates(matches)
      return matches
    } catch (err) {
      console.error('Duplicate complaint check failed:', err)
      return []
    } finally {
      if (currentRequestId === lastCheckRequestId.current) {
        setCheckingDuplicates(false)
      }
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicates(category, latitude, longitude)
    }, 400)

    return () => clearTimeout(timer)
  }, [category, latitude, longitude, checkDuplicates])

  const handleEndorse = async (complaint) => {
    if (!user) {
      toast.error(t('loginToEndorse'))
      return
    }

    const hasEndorsed = complaint.endorsedBy?.includes(user.uid)
    if (hasEndorsed) {
      toast.info(t('alreadyEndorsed'))
      return
    }

    if (pendingEndorsements.current.has(complaint.id)) return
    pendingEndorsements.current.add(complaint.id)
    setEndorsingMap((prev) => ({ ...prev, [complaint.id]: true }))

    try {
      const result = await endorseComplaint(complaint.id, user.uid)
      setNearbyDuplicates((prev) =>
        prev.map((c) => c.id === complaint.id
          ? {
              ...c,
              endorsedBy: result.endorsedBy,
              endorsementCount: result.endorsementCount,
            }
          : c)
      )

      if (result.added) toast.success(t('endorsementRecorded'))
      else toast.info(t('alreadyEndorsed'))
    } catch (err) {
      console.error('Failed to endorse complaint:', err)
      toast.error(t('endorsementFailed'))
    } finally {
      pendingEndorsements.current.delete(complaint.id)
      setEndorsingMap((prev) => ({ ...prev, [complaint.id]: false }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (isSubmittingRef.current || submitting) return

    const remaining = getRemainingCooldown(user?.uid)
    if (remaining > 0 || cooldownRemaining > 0) {
      const activeRemaining = remaining > 0 ? remaining : cooldownRemaining
      setCooldownRemaining(activeRemaining)
      toast.error(t('waitBeforeSubmitting').replace('{seconds}', activeRemaining))
      return
    }

    const cleanTitle = sanitizeText(title)
    const cleanDescription = sanitizeMarkdown(description)
    const cleanAddress = sanitizeText(address)
    const cleanCategory = sanitizeText(category)

    if (!cleanCategory || !cleanTitle || !cleanDescription || !cleanAddress) {
      toast.error(t('fillRequiredFields'))
      return
    }

    const hasLatitude = latitude.trim() !== ''
    const hasLongitude = longitude.trim() !== ''
    const lat = Number(latitude)
    const lng = Number(longitude)
    let nextCoordinateError = ''
    if (hasLatitude !== hasLongitude) {
      nextCoordinateError = 'Enter both latitude and longitude, or leave both blank.'
    } else if (hasLatitude && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      nextCoordinateError = 'Latitude must be a number between -90 and 90.'
    } else if (hasLongitude && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      nextCoordinateError = 'Longitude must be a number between -180 and 180.'
    }
    if (nextCoordinateError) {
      setCoordinateError(nextCoordinateError)
      toast.error(nextCoordinateError)
      return
    }
    setCoordinateError('')

    if (nearbyDuplicates.length > 0 && !hasAcknowledgedDuplicate) {
      toast.error(t('reviewSimilarComplaints'))
      return
    }

    isSubmittingRef.current = true
    setSubmitting(true)

    try {
      if (!navigator.onLine) {
        if (photoFile) {
          const photoValidation = validateComplaintPhoto(photoFile)
          if (!photoValidation.valid) {
            toast.error(photoValidation.error)
            isSubmittingRef.current = false
            setSubmitting(false)
            return
          }
        }

        await saveOfflineComplaint({
          title: cleanTitle,
          description: cleanDescription,
          category: cleanCategory,
          address: cleanAddress,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          userId: user.uid,
          photoFile: photoFile || null,
          audioBlob: voiceNote?.blob || null,
          audioDuration: voiceNote?.durationSeconds || null,
          audioMimeType: voiceNote?.contentType || null,
          severity: triageSeverity || 'Medium',
          priority: triageSeverity || 'Medium',
          aiTriage: aiTriageResult ? {
            category: aiTriageResult.category,
            department: aiTriageResult.department,
            confidence: aiTriageResult.confidence,
            severity: aiTriageResult.severity,
            source: aiTriageResult.source,
            suggestedTitle: aiTriageResult.suggestedTitle,
            suggestedDescription: aiTriageResult.suggestedDescription,
          } : null,
          wardId: resolvedJurisdiction?.wardId || null,
          ward: resolvedJurisdiction?.wardId || null,
          wardName: resolvedJurisdiction?.wardName || null,
          zoneName: resolvedJurisdiction?.zoneName || null,
          jurisdictionMeta: resolvedJurisdiction || null,
        })

        recordSubmissionTimestamp(user.uid, Date.now())
        setCooldownRemaining(COOLDOWN_SECONDS)
        isSubmittingRef.current = false
        setSubmitting(false)

        toast.success(t('offlineComplaintSaved'))
        navigate('/my-reports')
        return
      }

      const issueRef = doc(collection(db, 'issues'))
      const attachmentId = issueRef.id
      const uploadedArtifacts = []
      let photoUpload = null
      let audioUpload = null

      try {
        const uploadPromises = []

        if (photoFile) {
          uploadPromises.push(
            uploadComplaintPhoto(photoFile, attachmentId).then((res) => {
              if (res) {
                photoUpload = res
                if (res.path) uploadedArtifacts.push(res.path)
              }
              return res
            })
          )
        }

        if (voiceNote?.blob) {
          uploadPromises.push(
            uploadComplaintAudio(
              voiceNote.blob,
              attachmentId,
              voiceNote.durationSeconds
            ).then((res) => {
              if (res) {
                audioUpload = res
                if (res.path) uploadedArtifacts.push(res.path)
              }
              return res
            })
          )
        }

        await Promise.all(uploadPromises)
      } catch (uploadError) {
        if (uploadedArtifacts.length > 0) {
          await deleteComplaintEvidence(uploadedArtifacts)
        }
        throw uploadError
      }

      const imageUrl = photoUpload?.downloadUrl || null
      const photos = photoUpload ? [photoUpload] : []
      const audioNote = audioUpload
        ? {
            url: audioUpload.downloadUrl,
            path: audioUpload.path,
            filename: audioUpload.filename,
            durationSeconds: audioUpload.durationSeconds,
            contentType: audioUpload.contentType,
          }
        : null

      let complaintId = null
      try {
        await runTransaction(db, async (transaction) => {
          complaintId = await allocateComplaintId(transaction)

          const issuePayload = {
            complaintId,
            title: cleanTitle,
            description: cleanDescription,
            category: cleanCategory,
            address: cleanAddress,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            status: 'Pending',
            department: aiTriageResult?.department || '',
            severity: triageSeverity || 'Medium',
            priority: triageSeverity || 'Medium',
            aiTriage: aiTriageResult ? {
              category: aiTriageResult.category,
              department: aiTriageResult.department,
              confidence: aiTriageResult.confidence,
              severity: aiTriageResult.severity,
              source: aiTriageResult.source,
              suggestedTitle: aiTriageResult.suggestedTitle,
              suggestedDescription: aiTriageResult.suggestedDescription,
            } : null,
            reportedBy: user.uid,
            imageUrl,
            photos,
            audioNote,
            endorsedBy: [],
            endorsementCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }

          if (resolvedJurisdiction?.wardId) {
            issuePayload.wardId = resolvedJurisdiction.wardId
            issuePayload.ward = resolvedJurisdiction.wardId
            issuePayload.wardName = resolvedJurisdiction.wardName
            issuePayload.zoneName = resolvedJurisdiction.zoneName
          }

          transaction.set(issueRef, issuePayload)

          addComplaintEventToBatch(transaction, issueRef.id, {
            actorUid: user.uid,
            action: 'Complaint submitted',
            previousStatus: null,
            newStatus: 'Pending',
            remarks: description || 'Complaint submitted',
          })

          addNotificationToBatch(transaction, {
            recipientRole: 'admin',
            senderUid: user.uid,
            issueId: complaintId,
            type: 'new_complaint',
            title: 'New Complaint Submitted',
            message: 'A citizen has submitted a new complaint.',
          })
        })
      } catch (commitError) {
        if (uploadedArtifacts.length > 0) {
          await deleteComplaintEvidence(uploadedArtifacts)
        }
        throw commitError
      }

      recordSubmissionTimestamp(user?.uid, Date.now())
      setCooldownRemaining(COOLDOWN_SECONDS)
      isSubmittingRef.current = false
      setSubmitting(false)

      navigate('/complaint-confirmation', {
        state: { complaintId, issueId: issueRef.id, title },
      })
    } catch (err) {
      console.error('Complaint submission failed:', err)
      toast.error(err?.message || t('complaintSubmissionFailed'))
      isSubmittingRef.current = false
      setSubmitting(false)
    }
  }

  const ocrSuggestions = buildOCRSuggestions(ocrText)

  const applyOCRSuggestion = (field) => {
    const value =
      field === 'address' ? ocrSuggestions.address : ocrSuggestions.title
    if (!value) return

    if (field === 'address') {
      setAddress(value)
    } else {
      setTitle(value)
    }

    // Bring the filled field into view so the citizen can see and edit it.
    const input =
      field === 'address' ? addressInputRef.current : titleInputRef.current
    input?.focus?.()
    input?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div>
      <PageHeader
        title={t('newComplaint')}
        description={t('submitNewCivicComplaint')}
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">{t('complaintTitle')} *</Label>
                <Input
                  id="title"
                  placeholder={t('complaintTitlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('category')} *</Label>
                <Select
                  value={category}
                  onValueChange={(val) => {
                    setCategory(val)
                    setHasAcknowledgedDuplicate(false)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <div className="flex items-center gap-2">
                          <CategoryAvatar category={cat} size="xs" showLabel={false} />
                          <span>{t(categoryTranslationKeys[cat])}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t('description')} *</Label>
                <textarea
                  id="description"
                  rows={4}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 resize-none"
                  placeholder={t('describeIssuePlaceholder')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('voiceNoteOptional')}</Label>
                <VoiceRecorder
                  onRecordingComplete={setVoiceNote}
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground">
                  {t('voiceNoteDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complaint-photo">{t('photoEvidenceOptional')}</Label>
                <input
                  ref={fileInputRef}
                  id="complaint-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                  disabled={submitting}
                />

                {!photoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                    className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:border-primary-500 hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 dark:bg-primary-950/40 text-primary-600 dark:text-primary-400 mb-2">
                      <Camera className="h-5 w-5" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('takeOrUploadPhoto')}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {t('photoFormatLimit')}
                    </span>
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={photoPreview}
                        alt={t('selectedEvidence')}
                        className="h-14 w-14 rounded-md object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {photoFile?.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {photoFile
                            ? `${(photoFile.size / (1024 * 1024)).toFixed(2)} MB`
                            : ''}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 h-8 px-2 shrink-0"
                      onClick={handleRemovePhoto}
                      disabled={submitting}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t('remove')}
                    </Button>
                  </div>
                )}

                {photoFile && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-sm font-medium text-primary-600 dark:text-primary-400"
                      onClick={extractOCRSuggestion}
                      disabled={submitting || ocrRunning}
                    >
                      <Camera className="h-4 w-4 mr-1" />
                      Suggest from photo
                    </Button>

                    {ocrRunning && (
                      <span
                        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
                        role="status"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Extracting text from photo (up to 5s)...
                      </span>
                    )}
                  </div>
                )}

                {ocrText && !submitting && (
                  <div
                    className="mt-2 p-3 bg-primary-50 dark:bg-primary-950/40 rounded border border-primary-200 dark:border-primary-400"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="text-sm font-medium text-primary-800 dark:text-primary-200">
                      Text found in your photo. Use it to fill a field:
                    </p>
                    <p className="text-sm text-primary-900 dark:text-primary-100 line-clamp-3 mt-1 whitespace-pre-line">
                      {ocrText}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => applyOCRSuggestion('title')}
                        disabled={submitting || !ocrSuggestions.title}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Use as title
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => applyOCRSuggestion('address')}
                        disabled={submitting || !ocrSuggestions.address}
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        Use as address
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1.5 text-xs text-gray-600 dark:text-gray-300"
                        onClick={() => setOcrText('')}
                        disabled={submitting}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                )}

                {photoFile && ocrAttempted && !ocrRunning && !ocrText && (
                  <p
                    className="mt-2 text-xs text-gray-500 dark:text-gray-400"
                    role="status"
                  >
                    No readable text found in this photo. You can still fill in
                    the details manually.
                  </p>
                )}

                {(photoFile || aiTriageRunning || aiTriageResult) && (
                  <div className="mt-3">
                    <AITriageCard
                      triageResult={aiTriageResult}
                      analyzing={aiTriageRunning}
                      autoPopulated={aiAutoPopulated}
                      onAccept={handleAcceptAllTriage}
                      onApplyCategory={handleApplyTriageCategory}
                      onApplyTitle={handleApplyTriageTitle}
                      onApplyDescription={handleApplyTriageDescription}
                      onDismiss={handleDismissTriage}
                      disabled={submitting}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('pinComplaintLocation')}</Label>
                <ComplaintLocationMap
                  latitude={latitude}
                  longitude={longitude}
                  address={address}
                  selectable
                  onLocationSelect={({
                    latitude: nextLatitude,
                    longitude: nextLongitude,
                    address: nextAddress,
                  }) => {
                    setLatitude(nextLatitude)
                    setLongitude(nextLongitude)
                    if (nextAddress) setAddress(nextAddress)
                    setHasAcknowledgedDuplicate(false)
                    checkDuplicates(category, nextLatitude, nextLongitude)
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">{t('address')} *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="address"
                    ref={addressInputRef}
                    className="pl-9"
                    placeholder={t('addressPlaceholder')}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">{t('latitude')}</Label>
                  <Input
                    id="latitude"
                    type="text"
                    placeholder="28.6139"
                    value={latitude}
                    aria-invalid={Boolean(coordinateError)}
                    aria-describedby={coordinateError ? 'coordinate-error' : undefined}
                    onChange={(e) => {
                      setLatitude(e.target.value)
                      setCoordinateError('')
                      setHasAcknowledgedDuplicate(false)
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">{t('longitude')}</Label>
                  <Input
                    id="longitude"
                    type="text"
                    placeholder="77.2090"
                    value={longitude}
                    aria-invalid={Boolean(coordinateError)}
                    aria-describedby={coordinateError ? 'coordinate-error' : undefined}
                    onChange={(e) => {
                      setLongitude(e.target.value)
                      setCoordinateError('')
                      setHasAcknowledgedDuplicate(false)
                    }}
                  />
                </div>
              </div>

              {/* Automated Municipal Ward & Jurisdiction Detection Badge (Issue #251) */}
              {jurisdictionState !== 'idle' && (
                <div
                  className="rounded-lg border p-3.5 transition-all text-xs"
                  data-testid="jurisdiction-routing-badge"
                  role="status"
                  aria-live="polite"
                >
                  {jurisdictionState === 'detecting' && (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
                      <span>Detecting administrative ward & municipal jurisdiction...</span>
                    </div>
                  )}

                  {jurisdictionState === 'resolved' && resolvedJurisdiction && (
                    <div className="space-y-2 border-primary-200 bg-primary-50/50 dark:border-primary-900/40 dark:bg-primary-950/20 rounded-md p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono bg-primary-100 text-primary-800 dark:bg-primary-900/60 dark:text-primary-200 border-primary-300">
                            {resolvedJurisdiction.wardId}
                          </Badge>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {resolvedJurisdiction.wardName}
                          </span>
                        </div>
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                          {resolvedJurisdiction.zoneName}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-primary-100 dark:border-primary-900/30 text-gray-600 dark:text-gray-300">
                        {resolvedJurisdiction.councilorOffice && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-200">Zonal Office: </span>
                            {resolvedJurisdiction.councilorOffice}
                          </div>
                        )}
                        {resolvedJurisdiction.zoneSupervisor && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-200">Supervisor: </span>
                            {resolvedJurisdiction.zoneSupervisor}
                          </div>
                        )}
                        {resolvedJurisdiction.helpline && (
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-200">Helpline: </span>
                            <span className="font-mono">{resolvedJurisdiction.helpline}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {jurisdictionState === 'out_of_bounds' && (
                    <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 bg-amber-50/70 dark:bg-amber-950/20 p-2.5 rounded-md border border-amber-200 dark:border-amber-900/30">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">Location outside mapped ward boundaries. </span>
                        <span>This complaint will be routed to the Central Municipal Headquarters. You may still submit this complaint.</span>
                      </div>
                    </div>
                  )}

                  {jurisdictionState === 'invalid' && (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-950/20 p-2 rounded-md border border-red-200 dark:border-red-900/30">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Invalid coordinates entered. Latitude must be [-90, 90] and longitude [-180, 180].</span>
                    </div>
                  )}
                </div>
              )}

              {coordinateError && (
                <p id="coordinate-error" role="alert" className="text-sm text-destructive">
                  {coordinateError}
                </p>
              )}

              <div className="flex items-center justify-end">
                {checkingDuplicates && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />
                    {t('checkingNearbyDuplicates')}
                  </span>
                )}
              </div>

              <AnimatePresence>
                {nearbyDuplicates.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/30 shadow-sm space-y-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {t('similarIssueNearby')}
                          </h4>
                          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
                            {t('duplicateComplaintsFound')
                              .replace('{count}', nearbyDuplicates.length)
                              .replace('{category}', t(categoryTranslationKeys[category] || 'categoryOther'))}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {nearbyDuplicates.map((match) => {
                          const isEndorsed = Boolean(
                            user && match.endorsedBy?.includes(user.uid)
                          )
                          const isEndorsing = Boolean(endorsingMap[match.id])
                          const endorsementTotal =
                            match.endorsementCount || match.endorsedBy?.length || 0

                          return (
                            <div
                              key={match.id}
                              className="rounded-lg border border-amber-200 bg-white p-3.5 shadow-sm dark:border-amber-900/40 dark:bg-gray-900/90"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                      {getDisplayId(match)}
                                    </span>
                                    <Badge
                                      variant={statusVariant[match.status] || 'default'}
                                      className="capitalize text-[10px] px-1.5 py-0"
                                    >
                                      {t(statusTranslationKeys[match.status] || 'statusPending')}
                                    </Badge>
                                    <DepartmentCrest
                                      department={match.department}
                                      category={match.category || category}
                                      size="xs"
                                      variant="chip"
                                    />
                                    <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                      {t('metersAway').replace('{distance}', match.distanceMeters)}
                                    </span>
                                  </div>
                                  <h5 className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-1">
                                    {match.title}
                                  </h5>
                                </div>
                              </div>

                              {match.description && (
                                <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5 line-clamp-2">
                                  {match.description}
                                </p>
                              )}

                              {match.address && (
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{match.address}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex-wrap">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 text-xs text-gray-700 dark:text-gray-300"
                                  asChild
                                >
                                  <Link
                                    to={`/report/${match.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {t('viewIssue')}
                                  </Link>
                                </Button>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isEndorsed ? 'secondary' : 'default'}
                                  disabled={isEndorsed || isEndorsing}
                                  className="h-8 gap-1.5 text-xs"
                                  onClick={() => handleEndorse(match)}
                                >
                                  {isEndorsing ? (
                                    <>
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      {t('endorsing')}
                                    </>
                                  ) : isEndorsed ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                      {t('endorsedCount').replace('{count}', endorsementTotal)}
                                    </>
                                  ) : (
                                    <>
                                      <ThumbsUp className="h-3.5 w-3.5" />
                                      {t('iAlsoFaceThis')}
                                      {endorsementTotal > 0 ? ` (${endorsementTotal})` : ''}
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
                        <span>{t('stillSubmitSeparateComplaint')}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-900 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200 underline font-medium p-0"
                          onClick={() => setHasAcknowledgedDuplicate(true)}
                        >
                          {hasAcknowledgedDuplicate
                            ? t('confirmedProceed')
                            : t('proceedWithNewComplaint')}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {cooldownRemaining > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -10 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30 shadow-sm flex items-start gap-3">
                      <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0 animate-pulse" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                          {t('submissionCooldownActive')}
                        </h4>
                        <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
                          {t('cooldownDescription')}
                          {' '}
                          <span className="font-semibold text-amber-950 dark:text-amber-100">
                            {t('secondsRemaining').replace('{seconds}', cooldownRemaining)}
                          </span>.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  className="w-full gap-2 h-11"
                  disabled={submitting || cooldownRemaining > 0}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {photoFile ? t('uploadingPhotoSubmitting') : t('submitting')}
                    </>
                  ) : cooldownRemaining > 0 ? (
                    <>
                      <Clock className="h-4 w-4" />
                      {t('pleaseWaitSeconds').replace('{seconds}', cooldownRemaining)}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {nearbyDuplicates.length > 0 && !hasAcknowledgedDuplicate
                        ? t('reviewOrConfirmSubmission')
                        : t('submitComplaint')}
                    </>
                  )}
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
