import React from 'react'
import { ShieldCheck, Calendar, Info } from 'lucide-react'
import { formatEventDate } from '@/firebase/complaintEvents'

export default function EvidenceTombstone({
  erasedAt,
  reason = 'Municipal data retention policy',
  policyVersion = '2026.1',
  className = '',
}) {
  const formattedDate = erasedAt ? formatEventDate(erasedAt) : null

  return (
    <div
      data-testid="evidence-tombstone"
      className={`rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40 p-4 text-gray-700 dark:text-gray-300 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-gray-200 dark:bg-gray-700 p-2 text-gray-600 dark:text-gray-300 shrink-0 mt-0.5">
          <ShieldCheck className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            Evidence Erased Under Retention Policy
            <span className="inline-flex items-center rounded bg-gray-200/80 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-300 font-mono">
              v{policyVersion}
            </span>
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Attached photographic and audio evidence for this closed grievance was securely erased in accordance with the municipal data retention schedule.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {formattedDate && (
              <span className="flex items-center gap-1 font-mono">
                <Calendar className="h-3 w-3" />
                Erased {formattedDate}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Info className="h-3 w-3" />
              {reason}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
