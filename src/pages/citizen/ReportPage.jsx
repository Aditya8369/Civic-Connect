import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Crosshair, Send, AlertTriangle, ExternalLink, ThumbsUp, Check, Loader2, Camera, Trash2 } from 'lucide-react'
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  increment,
} from 'firebase/firestore'
import { db } from '@/firebase/services'
import { generateComplaintId, getDisplayId } from '@/firebase/complaintId'
import { addNotificationToBatch } from '@/firebase/notifications'
import { addComplaintEventToBatch } from '@/firebase/complaintEvents'
import { validateComplaintPhoto, uploadComplaintPhoto } from '@/firebase/storage'
import { useAuth } from '@/hooks/useAuth'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { findNearbyComplaints, parseCoordinates } from '@/utils/geo'
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

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
}

export function ReportPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Photo evidence state
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const fileInputRef = useRef(null)

  // Duplicate detection state
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [nearbyDuplicates, setNearbyDuplicates] = useState([])
  const [hasAcknowledgedDuplicate, setHasAcknowledgedDuplicate] = useState(false)
  const [endorsingMap, setEndorsingMap] = useState({})

  // Track latest check request to avoid race conditions
  const lastCheckRequestId = useRef(0)

  // Cleanup photo preview URL on unmount or file replacement
  useEffect(() => {
    return () => {
      if (photoPreview) {
        URL.revokeObjectURL(photoPreview)
      }
    }
  }, [photoPreview])

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateComplaintPhoto(file)
    if (!validation.valid) {
      toast.error(validation.error)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
    }

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleRemovePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoFile(null)
    setPhotoPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
      // Query active complaints in the same category
      const q = query(
        collection(db, 'issues'),
        where('category', '==', cat)
      )
      const snap = await getDocs(q)

      // Ignore response if another check started in the meantime
      if (currentRequestId !== lastCheckRequestId.current) {
        return []
      }

      const activeComplaints = []
      snap.forEach((docSnap) => {
        const data = docSnap.data()
        // Exclude resolved, closed or inactive complaints
        if (data.status !== 'Resolved') {
          activeComplaints.push({
            id: docSnap.id,
            ...data,
          })
        }
      })

      // Calculate distance and filter complaints within 50m
      const matches = findNearbyComplaints(coords, activeComplaints, 50)
      setNearbyDuplicates(matches)
      return matches
    } catch (err) {
      console.error('Duplicate complaint check failed:', err)
      // Non-blocking error: allow workflow to continue
      return []
    } finally {
      if (currentRequestId === lastCheckRequestId.current) {
        setCheckingDuplicates(false)
      }
    }
  }, [])

  // Re-check duplicates when category, latitude, or longitude changes
  useEffect(() => {
    const timer = setTimeout(() => {
      checkDuplicates(category, latitude, longitude)
    }, 400)

    return () => clearTimeout(timer)
  }, [category, latitude, longitude, checkDuplicates])

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latStr = position.coords.latitude.toFixed(6)
        const lngStr = position.coords.longitude.toFixed(6)
        setLatitude(latStr)
        setLongitude(lngStr)
        setLocating(false)
        toast.success('Location retrieved')
        checkDuplicates(category, latStr, lngStr)
      },
      () => {
        setLocating(false)
        toast.error('Could not retrieve location. Please enter coordinates manually.')
      }
    )
  }

  const handleEndorse = async (complaint) => {
    if (!user) {
      toast.error('You must be logged in to endorse a complaint')
      return
    }

    const hasEndorsed = complaint.endorsedBy?.includes(user.uid)
    if (hasEndorsed) {
      toast.info('You have already endorsed this complaint')
      return
    }

    setEndorsingMap((prev) => ({ ...prev, [complaint.id]: true }))
    try {
      const issueRef = doc(db, 'issues', complaint.id)
      await updateDoc(issueRef, {
        endorsedBy: arrayUnion(user.uid),
        endorsementCount: increment(1),
        updatedAt: serverTimestamp(),
      })

      // Optimistically update local state
      setNearbyDuplicates((prev) =>
        prev.map((c) => {
          if (c.id === complaint.id) {
            const currentEndorsed = c.endorsedBy || []
            const currentCount = c.endorsementCount || currentEndorsed.length || 0
            return {
              ...c,
              endorsedBy: [...currentEndorsed, user.uid],
              endorsementCount: currentCount + 1,
            }
          }
          return c
        })
      )

      toast.success('Thank you! Your endorsement has been recorded.')
    } catch (err) {
      console.error('Failed to endorse complaint:', err)
      toast.error('Failed to endorse complaint. Please try again.')
    } finally {
      setEndorsingMap((prev) => ({ ...prev, [complaint.id]: false }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!category || !title || !description || !address) {
      toast.error('Please fill in all required fields')
      return
    }

    // If duplicate complaints exist and citizen hasn't acknowledged, prompt them
    if (nearbyDuplicates.length > 0 && !hasAcknowledgedDuplicate) {
      toast.error('A similar issue has already been reported nearby. Please review or confirm.')
      return
    }

    setSubmitting(true)
    try {
      // Re-run a fast final duplicate check if coordinates and category exist
      if (latitude && longitude && !hasAcknowledgedDuplicate) {
        const matches = await checkDuplicates(category, latitude, longitude)
        if (matches && matches.length > 0) {
          setSubmitting(false)
          toast.error('A similar issue has already been reported nearby. Please review or confirm.')
          return
        }
      }

      const complaintId = await generateComplaintId()

      let imageUrl = null
      let photos = []
      if (photoFile) {
        try {
          const uploadRes = await uploadComplaintPhoto(photoFile, complaintId)
          imageUrl = uploadRes.downloadUrl
          photos = [uploadRes.downloadUrl]
        } catch (uploadErr) {
          console.error('Photo upload failed:', uploadErr)
          const isRetryLimit =
            uploadErr?.code === 'storage/retry-limit-exceeded' ||
            uploadErr?.message?.includes('retry-limit-exceeded')
          const msg = isRetryLimit
            ? import.meta.env.DEV
              ? 'Firebase Storage is unreachable. Configure emulators (VITE_USE_EMULATORS=true) or dev mock (VITE_MOCK_STORAGE=true) in .env.'
              : 'Firebase Storage is unreachable or bucket not enabled. Please check Firebase settings.'
            : uploadErr.message || 'Failed to upload photo. Please try again.'
          toast.error(msg)
          setSubmitting(false)
          return
        }
      }

      // Complaint and admin notification commit together, so a failed notification
      // can't leave behind a saved complaint that the citizen then re-submits.
      const batch = writeBatch(db)
      const issueRef = doc(collection(db, 'issues'))
      batch.set(issueRef, {
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
        imageUrl: imageUrl || null,
        photos: photos || [],
        endorsedBy: [],
        endorsementCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      addComplaintEventToBatch(batch, issueRef.id, {
        actorUid: user.uid,
        action: 'Complaint submitted',
        previousStatus: null,
        newStatus: 'Pending',
        remarks: description || 'Complaint submitted',
      })
      addNotificationToBatch(batch, {
        recipientRole: 'admin',
        senderUid: user.uid,
        issueId: complaintId,
        type: 'new_complaint',
        title: 'New Complaint Submitted',
        message: 'A citizen has submitted a new complaint.',
      })
      await batch.commit()
      toast.success('Complaint submitted successfully!')
      navigate('/my-reports')
    } catch (err) {
      console.error('Complaint submission failed:', err)
      toast.error('Failed to submit complaint. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="New Complaint"
        description="Submit a new civic complaint"
      />

      <div className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Complaint Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Pothole on Main Street"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={category}
                  onValueChange={(val) => {
                    setCategory(val)
                    setHasAcknowledgedDuplicate(false)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <textarea
                  id="description"
                  rows={4}
                  className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500 resize-none"
                  placeholder="Describe the issue in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complaint-photo">Photo Evidence (Optional)</Label>
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
                      Take photo or upload image
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      JPG or PNG up to 5MB (Mobile camera supported)
                    </span>
                  </button>
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50 dark:bg-gray-900/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={photoPreview}
                        alt="Selected evidence"
                        className="h-14 w-14 rounded-md object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {photoFile?.name}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {photoFile ? `${(photoFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
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
                      Remove
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address *</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="address"
                    className="pl-9"
                    placeholder="e.g. 123 Main Street, Downtown"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude</Label>
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
                  <Label htmlFor="longitude">Longitude</Label>
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

              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={getCurrentLocation}
                  disabled={locating}
                >
                  <Crosshair className={`h-4 w-4 ${locating ? 'animate-spin' : ''}`} />
                  {locating ? 'Getting location...' : 'Use Current Location'}
                </Button>

                {checkingDuplicates && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary-500" />
                    Checking for nearby duplicates...
                  </span>
                )}
              </div>

              {/* Duplicate Complaint Warning Alert */}
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
                            A similar issue has already been reported nearby.
                          </h4>
                          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1">
                            We found {nearbyDuplicates.length}{' '}
                            {nearbyDuplicates.length === 1 ? 'complaint' : 'complaints'} within 50 metres
                            in the <strong>{category}</strong> category. You can endorse the existing issue
                            instead of creating a duplicate ticket.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {nearbyDuplicates.map((match) => {
                          const isEndorsed =
                            Boolean(user && match.endorsedBy?.includes(user.uid))
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
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                                      {getDisplayId(match)}
                                    </span>
                                    <Badge
                                      variant={statusVariant[match.status] || 'default'}
                                      className="capitalize text-[10px] px-1.5 py-0"
                                    >
                                      {match.status}
                                    </Badge>
                                    <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-950/50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                      {match.distanceMeters}m away
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

                              <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-800">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 gap-1.5 text-xs text-gray-700 dark:text-gray-300"
                                  asChild
                                >
                                  <Link to={`/report/${match.id}`} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    View Issue
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
                                      Endorsing...
                                    </>
                                  ) : isEndorsed ? (
                                    <>
                                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                      Endorsed ({endorsementTotal})
                                    </>
                                  ) : (
                                    <>
                                      <ThumbsUp className="h-3.5 w-3.5" />
                                      I also face this {endorsementTotal > 0 ? `(${endorsementTotal})` : ''}
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="pt-2 border-t border-amber-200/80 dark:border-amber-900/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200">
                        <span>Still want to submit a separate complaint?</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-amber-900 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200 underline font-medium p-0"
                          onClick={() => setHasAcknowledgedDuplicate(true)}
                        >
                          {hasAcknowledgedDuplicate
                            ? '✓ Confirmed (Proceed below)'
                            : 'Proceed with New Complaint anyway'}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div whileTap={{ scale: 0.98 }}>
                <Button
                  type="submit"
                  className="w-full gap-2 h-11"
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {photoFile ? 'Uploading photo & submitting...' : 'Submitting...'}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {nearbyDuplicates.length > 0 && !hasAcknowledgedDuplicate
                        ? 'Review Nearby Issues or Confirm Submission'
                        : 'Submit Complaint'}
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
