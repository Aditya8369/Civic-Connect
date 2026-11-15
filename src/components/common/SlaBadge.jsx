
import { useState, useEffect } from 'react'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  computeSlaStatus,
  formatRemainingTime,
} from '@/utils/sla'
import { cn } from '@/utils/cn'
import { useLanguage } from '@/contexts/LanguageContext'

/**
 * Interactive color-coded SLA countdown and breach badge.
 * Dynamically refreshes every 30 seconds.
 */
export function SlaBadge({ complaint, className, showIcon = true }) {
  const [now, setNow] = useState(() => Date.now())
  const { t, language } = useLanguage()

  useEffect(() => {
    if (
      !complaint ||
      complaint.status === 'Resolved' ||
      complaint.status === 'Rejected'
    ) {
      return
    }

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 30000)

    return () => clearInterval(interval)
  }, [complaint])

  const status = computeSlaStatus(complaint, now, undefined, language)

  if (!status || !status.isValid || !status.badgeText) {
    return null
  }

  const tooltip = status.targetDate
    ? `${t('slaTarget')}: ${status.targetDate.toLocaleString(
        language === 'hi' ? 'hi-IN' : 'en-US',
        {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }
      )}`
    : undefined

  if (status.isBreached) {
    return (
      <Badge
        variant="destructive"
        className={cn(
          'inline-flex items-center gap-1.5 font-semibold text-xs animate-pulse',
          className
        )}
        role="status"
        aria-label={status.ariaLabel}
        title={tooltip}
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span>{status.badgeText}</span>
      </Badge>
    )
  }

  if (status.isDueSoon) {
    return (
      <Badge
        variant="warning"
        className={cn(
          'inline-flex items-center gap-1.5 font-medium text-xs',
          className
        )}
        role="status"
        aria-label={status.ariaLabel}
        title={tooltip}
      >
        {showIcon && (
          <AlertTriangle
            className="h-3 w-3 shrink-0"
            aria-hidden="true"
          />
        )}
        <span>{status.badgeText}</span>
      </Badge>
    )
  }

  if (status.isResolved) {
    return (
      <Badge
        variant="success"
        className={cn(
          'inline-flex items-center gap-1.5 font-medium text-xs',
          className
        )}
        role="status"
        aria-label={status.ariaLabel}
      >
        {showIcon && (
          <CheckCircle2
            className="h-3 w-3 shrink-0"
            aria-hidden="true"
          />
        )}
        <span>{status.badgeText}</span>
      </Badge>
    )
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1.5 font-medium text-xs text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700',
        className
      )}
      role="status"
      aria-label={status.ariaLabel}
      title={tooltip}
    >
      {showIcon && (
        <Clock
          className="h-3 w-3 shrink-0 text-gray-500 dark:text-gray-400"
          aria-hidden="true"
        />
      )}
      <span>{status.badgeText}</span>
    </Badge>
  )
}

/**
 * Detailed interactive live countdown timer panel.
 * Updates every second while the ticket is active.
 */
export function SlaCountdown({ complaint, className }) {
  const [now, setNow] = useState(() => Date.now())
  const { t, language } = useLanguage()

  useEffect(() => {
    if (
      !complaint ||
      complaint.status === 'Resolved' ||
      complaint.status === 'Rejected'
    ) {
      return
    }

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [complaint])

  const status = computeSlaStatus(complaint, now, undefined, language)

  if (!status || !status.isValid || status.isRejected) {
    return null
  }

  const formattedTarget = status.targetDate
    ? status.targetDate.toLocaleString(
        language === 'hi' ? 'hi-IN' : 'en-US',
        {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }
      )
    : '-'

  const remainingTime = formatRemainingTime(status.remainingMs, language)

  if (status.isResolved) {
    return (
      <div
        className={cn(
          'rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20',
          className
        )}
        role="region"
        aria-label={t('slaResolutionInformation')}
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2
            className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {t('slaResolvedWithin')}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              {t('slaTurnaround')} {status.badgeText}.{' '}
              {t('slaTargetWas')} {formattedTarget}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status.isBreached) {
    return (
      <div
        className={cn(
          'rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-900/50 dark:bg-red-950/20 animate-pulse',
          className
        )}
        role="region"
        aria-label={t('slaBreachedAlert')}
      >
        <div className="flex items-start gap-3">
          <div
            className="relative flex h-5 w-5 shrink-0 items-center justify-center mt-0.5"
            aria-hidden="true"
          >
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-red-400 opacity-75" />
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>

          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">
                {t('slaBreached')}
              </p>
              <span className="font-mono text-xs font-bold text-red-700 dark:text-red-400">
                {t('slaOverdueBy')} {remainingTime}
              </span>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              {t('slaDeadlineWas')} {formattedTarget}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (status.isDueSoon) {
    return (
      <div
        className={cn(
          'rounded-lg border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20',
          className
        )}
        role="region"
        aria-label={t('slaUrgentWarning')}
      >
        <div className="flex items-start gap-3">
          <Clock
            className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {t('slaUrgentDueSoon')}
              </p>
              <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                ⏳ {remainingTime} {t('slaRemaining')}
              </span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              {t('slaTargetDeadline')} {formattedTarget}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/50',
        className
      )}
      role="region"
      aria-label={t('slaResolutionCountdown')}
    >
      <div className="flex items-start gap-3">
        <Clock
          className="h-5 w-5 text-primary-600 dark:text-primary-400 shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('slaResolutionCountdown')}
            </p>
            <span className="font-mono text-xs font-semibold text-primary-600 dark:text-primary-400">
              ⏳ {remainingTime} {t('slaRemaining')}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('slaExpectedResolutionBy')} {formattedTarget}.
          </p>
        </div>
      </div>
    </div>
  )
}

