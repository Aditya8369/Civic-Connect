import React, { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  History,
  Clock,
  ArrowRight,
  ShieldCheck,
  User,
  AlertCircle,
  FileText,
  GitMerge,
  Building2,
  HardHat,
  CheckCircle2,
  Trash2,
  Lock,
  Unlock,
} from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { formatEventDate } from '@/firebase/complaintEvents'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const ACTION_ICONS = {
  'Complaint submitted': CheckCircle2,
  'Status changed': Clock,
  'Department assigned': Building2,
  'Resolution notes updated': FileText,
  'Field worker designated': HardHat,
  'Complaint merged': GitMerge,
  'Duplicate complaint consolidated': GitMerge,
  'Evidence retention erasure': Trash2,
  'Retention hold applied': Lock,
  'Retention hold released': Unlock,
}

export function ComplaintAuditTimeline({
  complaint = null,
  events = [],
  loading = false,
  error = null,
}) {
  const [profiles, setProfiles] = useState({})
  const profileCache = useRef({})

  // Resolve actor profiles for events
  useEffect(() => {
    let isMounted = true

    if (!events || events.length === 0) return

    const uidsToFetch = []
    events.forEach((evt) => {
      const uid = evt?.actorUid
      if (
        uid &&
        uid !== complaint?.reportedBy &&
        !profileCache.current[uid] &&
        !uidsToFetch.includes(uid)
      ) {
        uidsToFetch.push(uid)
      }
    })

    if (uidsToFetch.length === 0) return

    // Mark as pending in cache to avoid duplicate fetches
    uidsToFetch.forEach((uid) => {
      profileCache.current[uid] = { status: 'loading' }
    })

    Promise.all(
      uidsToFetch.map(async (uid) => {
        try {
          const userSnap = await getDoc(doc(db, 'users', uid))
          if (userSnap.exists()) {
            const data = userSnap.data()
            return {
              uid,
              name: data?.name || null,
              role: data?.role || null,
            }
          }
          return { uid, name: null, role: null }
        } catch {
          return { uid, name: null, role: null }
        }
      })
    ).then((results) => {
      if (!isMounted) return

      const updated = {}
      results.forEach((res) => {
        profileCache.current[res.uid] = res
        updated[res.uid] = res
      })

      setProfiles((prev) => ({ ...prev, ...updated }))
    })

    return () => {
      isMounted = false
    }
  }, [events, complaint?.reportedBy])

  // Determine timeline items
  let displayItems = []
  const hasEvents = Array.isArray(events) && events.length > 0

  if (hasEvents) {
    displayItems = events.map((evt, idx) => ({
      id: evt.id || `event-${idx}`,
      isLegacy: false,
      action: evt.action || 'Activity recorded',
      timestamp: evt.timestamp,
      actorUid: evt.actorUid ?? null,
      previousStatus: evt.previousStatus ?? null,
      newStatus: evt.newStatus ?? null,
      remarks: evt.remarks || '',
    }))
  } else if (complaint && complaint.createdAt) {
    const formattedCreated = formatEventDate(complaint.createdAt)
    if (formattedCreated) {
      displayItems = [
        {
          id: 'legacy-initial',
          isLegacy: true,
          action: 'Initial submission (legacy record)',
          timestamp: complaint.createdAt,
          actorUid: complaint.reportedBy || null,
          previousStatus: null,
          newStatus: complaint.status || 'Pending',
          remarks: complaint.description || 'Initial legacy complaint record',
        },
      ]
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base text-gray-900 dark:text-white">
            <History className="h-5 w-5 text-primary-600 dark:text-primary-400" />
            Activity & Audit History
          </CardTitle>
          {hasEvents && (
            <Badge variant="outline" className="text-xs font-normal">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Failed to load audit history.</span>
          </div>
        ) : displayItems.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">
            No audit activity recorded for this complaint.
          </p>
        ) : (
          <div className="relative ml-2">
            <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-800" />
            <div className="space-y-6">
              {displayItems.map((item, index) => {
                const IconComponent = ACTION_ICONS[item.action] || Clock
                const formattedDate = formatEventDate(item.timestamp)

                // Actor resolution
                let actorName = 'System / Unspecified Actor'
                let actorRole = null
                let isReporter = false

                if (complaint && item.actorUid && item.actorUid === complaint.reportedBy) {
                  actorName = 'Citizen (Reporter)'
                  isReporter = true
                } else if (item.actorUid) {
                  const resolved = profiles[item.actorUid] || profileCache.current[item.actorUid]
                  if (resolved && resolved.name) {
                    actorName = resolved.name
                    actorRole = resolved.role || null
                  }
                }

                const showTransition =
                  item.previousStatus &&
                  item.newStatus &&
                  item.previousStatus !== item.newStatus

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.05 }}
                    className="relative flex gap-4"
                  >
                    <div
                      className={`relative z-10 mt-1 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                        item.isLegacy
                          ? 'border-amber-500 bg-amber-50 dark:border-amber-400 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          : 'border-primary-600 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      }`}
                    >
                      <IconComponent className="h-2.5 w-2.5" />
                    </div>

                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {item.action}
                          </span>
                          {item.isLegacy && (
                            <Badge
                              variant="warning"
                              className="text-[10px] uppercase font-bold tracking-wider py-0 px-1.5"
                            >
                              Legacy
                            </Badge>
                          )}
                        </div>
                        {formattedDate && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-mono">
                            {formattedDate}
                          </span>
                        )}
                      </div>

                      {/* Actor attribution line */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        {isReporter ? (
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 shrink-0" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        )}
                        <span className="font-medium">{actorName}</span>
                        {actorRole && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] capitalize py-0 px-1.5 font-normal"
                          >
                            {actorRole}
                          </Badge>
                        )}
                      </div>

                      {/* Status Transition */}
                      {showTransition && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400">
                          <span>{item.previousStatus}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span>{item.newStatus}</span>
                        </div>
                      )}

                      {/* Remarks */}
                      {item.remarks && (
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed break-words bg-gray-50 dark:bg-gray-800/40 p-2 rounded border border-gray-100 dark:border-gray-800">
                          {item.remarks}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
