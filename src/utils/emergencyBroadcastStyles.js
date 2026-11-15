import { AlertTriangle, Info, Siren } from 'lucide-react'
import { DEFAULT_BROADCAST_SEVERITY } from '@/firebase/emergencyBroadcasts'

/**
 * Visual language for each emergency broadcast severity. Shared by the citizen
 * banner and the administrator composer preview so both always match.
 */
export const BROADCAST_SEVERITY_STYLES = Object.freeze({
  info: {
    label: 'Public notice',
    icon: Info,
    banner:
      'border-blue-200 bg-blue-50/90 dark:border-blue-900/60 dark:bg-blue-950/30',
    iconWrap: 'bg-blue-100 dark:bg-blue-900/50',
    iconColor: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
    title: 'text-blue-950 dark:text-blue-100',
    message: 'text-blue-800 dark:text-blue-200',
    dismiss:
      'text-blue-600 hover:bg-blue-100 hover:text-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/50 dark:hover:text-blue-100',
    accent: 'bg-blue-600',
  },
  warning: {
    label: 'Citywide advisory',
    icon: AlertTriangle,
    banner:
      'border-amber-300 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30',
    iconWrap: 'bg-amber-100 dark:bg-amber-900/50',
    iconColor: 'text-amber-600 dark:text-amber-300',
    badge:
      'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200',
    title: 'text-amber-950 dark:text-amber-100',
    message: 'text-amber-900 dark:text-amber-200',
    dismiss:
      'text-amber-600 hover:bg-amber-100 hover:text-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/50 dark:hover:text-amber-100',
    accent: 'bg-amber-500',
  },
  critical: {
    label: 'Emergency alert',
    icon: Siren,
    banner:
      'border-red-300 bg-red-50/90 dark:border-red-900/60 dark:bg-red-950/30',
    iconWrap: 'bg-red-100 dark:bg-red-900/50',
    iconColor: 'text-red-600 dark:text-red-300',
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200',
    title: 'text-red-950 dark:text-red-100',
    message: 'text-red-800 dark:text-red-200',
    dismiss:
      'text-red-600 hover:bg-red-100 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-900/50 dark:hover:text-red-100',
    accent: 'bg-red-600',
  },
})

export function getBroadcastSeverityStyle(severity) {
  return (
    BROADCAST_SEVERITY_STYLES[severity] ||
    BROADCAST_SEVERITY_STYLES[DEFAULT_BROADCAST_SEVERITY]
  )
}
