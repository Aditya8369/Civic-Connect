
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
import { findNearbyComplaints, parseCoordinates } from '@/utils/geo'
import { ComplaintLocationMap } from '@/components/common/ComplaintLocationMap'
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
  const fileInputRef = useRef(null)
  const [voiceNote, setVoiceNote] = useState(null)

  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [nearbyDuplicates, setNearbyDuplicates] = useState([])
  const [hasAcknowledgedDuplicate, setHasAcknowledgedDuplicate] = useState(false)
  const [endorsingMap, setEndorsingMap] = useState({})
  const pendingEndorsements = useRef(new Set())
  const lastCheckRequestId = useRef(0)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const handlePhotoChange = (e) => {
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
  }

  const handleRemovePhoto = () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
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

    if (!category || !title || !description || !address) {
      toast.error(t('fillRequiredFields'))
      return
    }

    if (nearbyDuplicates.length > 0 && !hasAcknowledgedDuplicate) {
      toast.error(t('reviewSimilarComplaints'))
      return
    }

    if (!navigator.onLine && voiceNote?.blob) {
      toast.error(t('voiceNoteNeedsInternet'))
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
          title,
          description,
          category,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          userId: user.uid,
          photoFile: photoFile || null,
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

          transaction.set(issueRef, {
            complaintId,
            title,
            description,
            category,
            address,
            latitude: latitude ? parseFloat(latitude) : null,
            longitude: longitude ? parseFloat(longitude) : null,
            status: 'Pending',
            department: '',
            reportedBy: user.uid,
            imageUrl,
            photos,
            audioNote,
            endorsedBy: [],
            endorsementCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })

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
                    onChange={(e) => {
                      setLatitude(e.target.value)
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
                    onChange={(e) => {
                      setLongitude(e.target.value)
                      setHasAcknowledgedDuplicate(false)
                    }}
                  />
                </div>
              </div>

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
