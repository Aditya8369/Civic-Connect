import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { listenToActiveEmergencyBroadcast } from '@/firebase/emergencyBroadcasts'
import { getBroadcastSeverityStyle } from '@/utils/emergencyBroadcastStyles'
import {
  getBroadcastDismissKey,
  persistDismissedBroadcastKey,
  readDismissedBroadcastKey,
} from '@/utils/emergencyBroadcastDismissal'
import { formatRelativeTime } from '@/utils/relativeTime'

/**
 * Presentational alert card shared by the citizen banner and the admin
 * composer preview.
 */
export function EmergencyAlertBannerView({
  broadcast,
  onDismiss,
  preview = false,
}) {
  if (!broadcast) return null

  const style = getBroadcastSeverityStyle(broadcast.severity)
  const Icon = style.icon
  const publishedLabel = formatRelativeTime(broadcast.createdAt)

  return (
    <motion.section
      data-testid="emergency-alert-banner"
      data-severity={broadcast.severity || 'warning'}
      role={preview ? 'status' : 'alert'}
      aria-label={
        preview
          ? 'Emergency alert preview'
          : `${style.label}: ${broadcast.title}`
      }
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25 }}
      className={`relative mb-6 overflow-hidden rounded-xl border p-4 shadow-sm ${style.banner}`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1.5 ${style.accent}`}
      />

      <div className="flex items-start gap-3 pl-1.5">
        <div
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.iconWrap}`}
        >
          <Icon
            className={`h-5 w-5 ${style.iconColor}`}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${style.badge}`}
            >
              {style.label}
            </span>

            {publishedLabel && (
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {publishedLabel}
              </span>
            )}
          </div>

          <p className={`mt-1.5 text-sm font-bold ${style.title}`}>
            {broadcast.title}
          </p>
          <p className={`mt-1 whitespace-pre-line text-sm ${style.message}`}>
            {broadcast.message}
          </p>
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss emergency alert"
            className={`rounded-md p-1.5 transition ${style.dismiss}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </motion.section>
  )
}

/**
 * Live citywide emergency banner. Subscribes to the active broadcast document
 * and keeps the dismissal in local storage scoped to that specific alert.
 */
export function EmergencyAlertBanner() {
  const [broadcast, setBroadcast] = useState(null)
  const [dismissedKey, setDismissedKey] = useState(readDismissedBroadcastKey)

  useEffect(() => {
    const unsubscribe = listenToActiveEmergencyBroadcast(
      (nextBroadcast) => setBroadcast(nextBroadcast),
      {
        onError: (error) => {
          console.error('Emergency broadcast listener error:', error)
        },
      }
    )

    return typeof unsubscribe === 'function' ? unsubscribe : () => {}
  }, [])

  const broadcastKey = getBroadcastDismissKey(broadcast)
  const isVisible = Boolean(broadcast) && broadcastKey !== dismissedKey

  const handleDismiss = () => {
    setDismissedKey(broadcastKey)
    persistDismissedBroadcastKey(broadcastKey)
  }

  return (
    <AnimatePresence initial={false}>
      {isVisible && (
        <EmergencyAlertBannerView
          key={broadcastKey}
          broadcast={broadcast}
          onDismiss={handleDismiss}
        />
      )}
    </AnimatePresence>
  )
}

export default EmergencyAlertBanner
