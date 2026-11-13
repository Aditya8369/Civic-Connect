import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  PartyPopper,
  Heart,
  Users,
  HardHat,
  Sparkles,
  CheckCircle2,
  ThumbsUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ConfettiBurst from './ConfettiBurst'
import BeforeAfterComparisonSlider from './BeforeAfterComparisonSlider'
import { Button } from '@/components/ui/button'

export function MilestoneCelebrationBanner({
  complaint,
  onThankWorker,
  className = '',
}) {
  const isResolved = complaint && complaint.status === 'Resolved'
  const complaintId = complaint?.id || complaint?.complaintId || 'complaint'
  const storageKey = `civic_thanked_${complaintId}`

  const [hasThanked, setHasThanked] = useState(false)
  const [showConfetti, setShowConfetti] = useState(true)
  const [thanksCount, setThanksCount] = useState(() => {
    return typeof complaint?.workerThanksCount === 'number'
      ? complaint.workerThanksCount
      : 0
  })

  // Read saved appreciation state from localStorage
  useEffect(() => {
    if (!isResolved) return
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem(storageKey)
        if (saved === 'true') {
          setHasThanked(true)
        }
      }
    } catch {
      // Storage access may be blocked in some sandboxed environments
    }
  }, [isResolved, storageKey])

  if (!isResolved) {
    return null
  }

  // Safely extract photo URL whether stored as string or upload object
  const extractPhotoUrl = (photo) => {
    if (!photo) return null
    if (typeof photo === 'string') return photo
    if (typeof photo?.downloadUrl === 'string') return photo.downloadUrl
    if (typeof photo?.url === 'string') return photo.url
    return null
  }

  // Extract photos
  const beforePhoto =
    extractPhotoUrl(complaint.imageUrl) ||
    (Array.isArray(complaint.photos) && extractPhotoUrl(complaint.photos[0])) ||
    null

  const afterPhoto =
    extractPhotoUrl(complaint.resolutionImageUrl) ||
    extractPhotoUrl(complaint.resolvedPhotoUrl) ||
    extractPhotoUrl(complaint.resolutionProof) ||
    (Array.isArray(complaint.resolvedPhotos) && extractPhotoUrl(complaint.resolvedPhotos[0])) ||
    (Array.isArray(complaint.photos) && complaint.photos.length > 1
      ? extractPhotoUrl(complaint.photos[1])
      : null)

  // Endorsement counter calculation
  const endorsementCount =
    typeof complaint.endorsementCount === 'number'
      ? complaint.endorsementCount
      : Array.isArray(complaint.endorsedBy)
      ? complaint.endorsedBy.length
      : 0

  const worker = complaint.assignedWorker
  const workerName = worker?.name || null
  const departmentName = complaint.department || 'Municipal Services'

  const handleThankWorker = () => {
    if (hasThanked) {
      toast('You have already thanked the worker for this resolution!', {
        icon: '❤️',
      })
      return
    }

    setHasThanked(true)
    setThanksCount((c) => c + 1)
    setShowConfetti(true)

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, 'true')
      }
    } catch {
      // ignore storage error
    }

    const displayWorker = workerName ? workerName : `the ${departmentName} team`
    toast.success(`Thank you! Your appreciation was sent to ${displayWorker}.`, {
      icon: '🙌',
    })

    onThankWorker?.({
      complaintId,
      workerName: displayWorker,
      department: departmentName,
    })
  }

  return (
    <motion.section
      aria-label="Civic milestone celebration banner"
      data-testid="milestone-celebration-banner"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`relative overflow-hidden rounded-2xl border border-emerald-300/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/70 p-5 sm:p-6 shadow-sm dark:border-emerald-800/80 dark:from-emerald-950/40 dark:via-gray-900 dark:to-teal-950/30 ${className}`}
    >
      {/* Confetti particle burst */}
      <ConfettiBurst
        active={showConfetti}
        onComplete={() => setShowConfetti(false)}
      />

      <div className="relative z-10 flex flex-col gap-5">
        {/* Banner Header with celebratory badge & title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
              <PartyPopper className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Civic Milestone Achieved</span>
              <Sparkles className="h-3 w-3 text-amber-500 animate-pulse" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Neighborhood Issue Resolved!
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 max-w-xl">
              Civic progress in action. Thanks to citizen reports and municipal teamwork, this issue has been officially addressed and completed.
            </p>
          </div>

          {/* Community endorsement celebration pill */}
          <div
            data-testid="endorsement-counter-card"
            className="flex items-center gap-2 self-start sm:self-auto rounded-xl border border-emerald-200/80 bg-white/90 px-3.5 py-2 shadow-xs dark:border-emerald-800/60 dark:bg-gray-800/80 backdrop-blur-xs"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
              {endorsementCount > 0 ? (
                <Users className="h-4 w-4" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Community Power
              </p>
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                {endorsementCount > 0 ? (
                  <>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {endorsementCount}
                    </span>{' '}
                    {endorsementCount === 1 ? 'neighbor' : 'neighbors'} backed
                  </>
                ) : (
                  'Community Victory'
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Visual Cards / Comparison Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Resolution Evidence & Transformation
            </span>
          </div>

          <BeforeAfterComparisonSlider
            beforeImage={beforePhoto}
            afterImage={afterPhoto}
            beforeLabel="Before (Reported)"
            afterLabel="After (Resolved)"
          />
        </div>

        {/* Municipal Worker Appreciation Section */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-emerald-200/70 bg-white/70 p-3.5 sm:p-4 dark:border-emerald-900/40 dark:bg-gray-900/60 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
              <HardHat className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Field Execution
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {workerName ? (
                  <>
                    Resolved by{' '}
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {workerName}
                    </span>{' '}
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      ({departmentName})
                    </span>
                  </>
                ) : (
                  <>
                    Resolved by the{' '}
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {departmentName} Team
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:self-center">
            {thanksCount > 0 && (
              <span
                data-testid="worker-thanks-count"
                className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1"
              >
                {thanksCount} {thanksCount === 1 ? 'thanks' : 'thanks'}
              </span>
            )}
            <Button
              type="button"
              variant={hasThanked ? 'outline' : 'default'}
              size="sm"
              onClick={handleThankWorker}
              aria-label="Thank your Municipal Worker"
              data-testid="thank-worker-button"
              className={`gap-1.5 font-medium transition-all cursor-pointer ${
                hasThanked
                  ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/40'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              }`}
            >
              <Heart
                className={`h-4 w-4 ${
                  hasThanked
                    ? 'fill-red-500 text-red-500'
                    : 'text-white'
                }`}
              />
              <span>
                {hasThanked
                  ? 'Appreciation Sent!'
                  : 'Thank your Municipal Worker'}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </motion.section>
  )
}

export default MilestoneCelebrationBanner
