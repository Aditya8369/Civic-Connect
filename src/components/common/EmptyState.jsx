
import { forwardRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'
import { useLanguage } from '@/contexts/LanguageContext'

function ReportsIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="82" className="fill-primary-50 dark:fill-primary-950/40" />
      <circle cx="100" cy="100" r="66" className="fill-primary-100/70 dark:fill-primary-900/30" />
      <circle cx="44" cy="56" r="4" className="fill-primary-400/60 dark:fill-primary-400/40" />
      <circle cx="158" cy="142" r="5" className="fill-primary-300/60 dark:fill-primary-500/30" />
      <path
        d="M152 52L154.5 57.5L160 60L154.5 62.5L152 68L149.5 62.5L144 60L149.5 57.5L152 52Z"
        className="fill-amber-400 dark:fill-amber-300"
      />
      <rect
        x="60"
        y="42"
        width="80"
        height="116"
        rx="12"
        className="fill-white dark:fill-gray-900 stroke-gray-300 dark:stroke-gray-700"
        strokeWidth="3"
      />
      <rect x="82" y="34" width="36" height="16" rx="6" className="fill-primary-600 dark:fill-primary-500" />
      <circle cx="100" cy="42" r="3" className="fill-white" />
      <rect x="76" y="66" width="48" height="6" rx="3" className="fill-primary-500/80 dark:fill-primary-400" />
      <rect x="76" y="80" width="36" height="5" rx="2.5" className="fill-gray-200 dark:fill-gray-700" />
      <rect x="76" y="93" width="42" height="5" rx="2.5" className="fill-gray-200 dark:fill-gray-700" />
      <rect x="76" y="106" width="30" height="5" rx="2.5" className="fill-gray-200 dark:fill-gray-700" />
      <g transform="translate(112, 114)">
        <circle cx="18" cy="18" r="18" className="fill-emerald-500" />
        <path
          d="M11 18.5L16 23.5L25 13.5"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

function NotificationsIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="82" className="fill-emerald-50 dark:fill-emerald-950/40" />
      <circle cx="100" cy="100" r="66" className="fill-emerald-100/70 dark:fill-emerald-900/30" />
      <path
        d="M52 50L54 54L58 56L54 58L52 62L50 58L46 56L50 54L52 50Z"
        className="fill-amber-400 dark:fill-amber-300"
      />
      <path
        d="M154 68L155.5 71L158.5 72.5L155.5 74L154 77L152.5 74L149.5 72.5L152.5 71L154 68Z"
        className="fill-emerald-400 dark:fill-emerald-300"
      />
      <circle cx="48" cy="136" r="4" className="fill-emerald-300 dark:fill-emerald-500/40" />
      <path
        d="M100 46C86.7452 46 76 56.7452 76 70V96C76 102 72 108 66 112V118H134V112C128 108 124 102 124 96V70C124 56.7452 113.255 46 100 46Z"
        className="fill-white dark:fill-gray-900 stroke-primary-600 dark:stroke-primary-400"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M92 122C92 126.418 95.5817 130 100 130C104.418 130 108 126.418 108 122"
        className="stroke-gray-400 dark:stroke-gray-500"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M96 46V41C96 38.7909 97.7909 37 100 37C102.209 37 104 38.7909 104 41V46"
        className="stroke-primary-600 dark:stroke-primary-400"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <g transform="translate(108, 102)">
        <circle cx="20" cy="20" r="18" className="fill-emerald-500 dark:fill-emerald-600" />
        <path
          d="M13 20L18 25L28 14"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

function CommunityIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="82" className="fill-sky-50 dark:fill-sky-950/40" />
      <circle cx="100" cy="100" r="66" className="fill-sky-100/70 dark:fill-sky-900/30" />
      <rect x="42" y="112" width="22" height="34" rx="2" className="fill-sky-200/60 dark:fill-sky-900/40" />
      <rect x="70" y="98" width="26" height="48" rx="2" className="fill-sky-300/50 dark:fill-sky-800/40" />
      <rect x="104" y="106" width="24" height="40" rx="2" className="fill-sky-200/60 dark:fill-sky-900/40" />
      <rect x="134" y="116" width="24" height="30" rx="2" className="fill-sky-300/50 dark:fill-sky-800/40" />
      <circle cx="68" cy="138" r="8" className="fill-emerald-400/80 dark:fill-emerald-600/60" />
      <rect x="66" y="138" width="4" height="8" className="fill-amber-700/60 dark:fill-amber-800/60" />
      <g>
        <path
          d="M52 64C52 54.0589 60.0589 46 70 46H104C113.941 46 122 54.0589 122 64V78C122 87.9411 113.941 96 104 96H78L62 106V95.0772C56.0357 92.1793 52 85.7485 52 78V64Z"
          className="fill-white dark:fill-gray-900 stroke-primary-600 dark:stroke-primary-400"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <rect x="68" y="62" width="38" height="4" rx="2" className="fill-primary-500/80 dark:fill-primary-400" />
        <rect x="68" y="72" width="24" height="4" rx="2" className="fill-gray-300 dark:fill-gray-600" />
      </g>
      <g transform="translate(102, 70)">
        <path
          d="M0 16C0 7.16344 7.16344 0 16 0H42C50.8366 0 58 7.16344 58 16V28C58 36.8366 50.8366 44 42 44H34L24 52V43.5134C18.6756 41.5204 15 36.3195 15 30.2V28"
          className="fill-white dark:fill-gray-800 stroke-amber-500 dark:stroke-amber-400"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M29 18C27.5 14.5 22 15 22 18.5C22 22 29 27 29 27C29 27 36 22 36 18.5C36 15 30.5 14.5 29 18Z"
          className="fill-red-500"
        />
      </g>
      <circle cx="158" cy="54" r="3" className="fill-primary-400" />
      <path
        d="M40 82L41.5 85L44.5 86.5L41.5 88L40 91L38.5 88L35.5 86.5L38.5 85L40 82Z"
        className="fill-amber-400"
      />
    </svg>
  )
}

function DefaultIllustration({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="100" cy="100" r="82" className="fill-gray-100 dark:fill-gray-800/40" />
      <circle cx="100" cy="100" r="66" className="fill-gray-200/60 dark:fill-gray-800/60" />
      <rect
        x="64"
        y="64"
        width="72"
        height="72"
        rx="16"
        className="fill-white dark:fill-gray-900 stroke-gray-300 dark:stroke-gray-700"
        strokeWidth="3"
      />
      <circle cx="100" cy="94" r="14" className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="3" />
      <path
        d="M110 104L122 116"
        className="stroke-gray-400 dark:stroke-gray-500"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EmptyState({
  title,
  heading,
  description,
  actionLabel,
  actionText,
  onAction,
  action,
  variant = 'default',
  illustration,
  className = '',
  actionVariant = 'default',
}) {
  const { t } = useLanguage()

  const displayHeading = heading || title || t('emptyStateDefaultTitle')
  const displayActionLabel = actionLabel || actionText

  const renderIllustration = () => {
    if (illustration) return illustration

    const commonClass =
      'h-40 w-40 sm:h-48 sm:w-48 mb-6 drop-shadow-sm select-none'

    switch (variant) {
      case 'reports':
        return <ReportsIllustration className={commonClass} />
      case 'notifications':
        return <NotificationsIllustration className={commonClass} />
      case 'community':
      case 'posts':
        return <CommunityIllustration className={commonClass} />
      case 'default':
      default:
        return <DefaultIllustration className={commonClass} />
    }
  }

  return (
    <Card
      className={cn(
        'overflow-hidden text-center border-gray-200 dark:border-gray-800',
        className
      )}
      role="region"
      aria-label={displayHeading}
    >
      <CardContent className="flex flex-col items-center justify-center p-8 sm:p-12">
        {renderIllustration()}

        <h3 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-2">
          {displayHeading}
        </h3>

        {description && (
          <p className="max-w-md text-sm text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
            {description}
          </p>
        )}

        {action ? (
          action
        ) : displayActionLabel && onAction ? (
          <Button
            onClick={onAction}
            variant={actionVariant}
            className="gap-2 shadow-sm"
          >
            {displayActionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default EmptyState
