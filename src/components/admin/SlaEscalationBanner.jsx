import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clock, X, ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { formatRemainingTime, getSlaTargetDate } from '@/utils/sla'
import { getDisplayId } from '@/firebase/complaintId'

const URGENT_THRESHOLD_MS = 2 * 60 * 60 * 1000
const DISMISS_KEY = 'civic-connect:sla-escalation-banner:dismissed'

function isActiveComplaint(complaint) {
  return (
    complaint &&
    complaint.status !== 'Resolved' &&
    complaint.status !== 'Rejected'
  )
}

function getUrgentComplaints(complaints, now) {
  return complaints
    .filter(isActiveComplaint)
    .map((complaint) => {
      const targetDate = getSlaTargetDate(
        complaint.createdAt,
        complaint.category,
        complaint.department
      )

      if (!targetDate) {
        return null
      }

      const remainingMs = targetDate.getTime() - now

      if (remainingMs > URGENT_THRESHOLD_MS) {
        return null
      }

      return {
        complaint,
        targetDate,
        remainingMs,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.remainingMs - b.remainingMs)
}

function wasDismissedThisSession() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'true'
  } catch {
    return false
  }
}

export function SlaEscalationBanner({
  complaints = [],
  onShowUrgentTickets,
}) {
  const [now, setNow] = useState(() => Date.now())
  const [dismissed, setDismissed] = useState(wasDismissedThisSession)

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const urgentComplaints = useMemo(
    () => getUrgentComplaints(complaints, now),
    [complaints, now]
  )

  const mostUrgent = urgentComplaints[0]

  const handleDismiss = () => {
    setDismissed(true)

    try {
      sessionStorage.setItem(DISMISS_KEY, 'true')
    } catch {
      // Ignore storage errors; dismissal still works for this render.
    }
  }

  if (dismissed || urgentComplaints.length === 0) {
    return null
  }

  const isBreached = mostUrgent.remainingMs <= 0
  const ticketId = getDisplayId(mostUrgent.complaint)
  const timeText = formatRemainingTime(mostUrgent.remainingMs)

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.25 }}
        className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900/60 dark:bg-red-950/20"
        role="alert"
        aria-label="Urgent SLA escalation"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <AlertTriangle
              className="h-5 w-5 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-red-900 dark:text-red-200">
                  {isBreached
                    ? 'Urgent SLA Escalation'
                    : 'Priority SLA Escalation'}
                </p>

                <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                  {urgentComplaints.length}{' '}
                  {urgentComplaints.length === 1
                    ? 'ticket requires'
                    : 'tickets require'}{' '}
                  immediate attention.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-md p-1.5 text-red-500 transition hover:bg-red-100 hover:text-red-700 dark:hover:bg-red-900/40"
                aria-label="Dismiss SLA escalation banner for this session"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-red-800 dark:text-red-200">
                <span className="font-medium">Most urgent:</span>
                <span className="font-mono font-bold">{ticketId}</span>
              </div>

              <div className="flex items-center gap-1.5 font-mono font-bold text-red-800 dark:text-red-200">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />

                {isBreached ? (
                  <span>Overdue by {timeText}</span>
                ) : (
                  <span>{timeText} remaining</span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onShowUrgentTickets}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-red-950"
            >
              Show Urgent Tickets
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export { URGENT_THRESHOLD_MS, getUrgentComplaints }
