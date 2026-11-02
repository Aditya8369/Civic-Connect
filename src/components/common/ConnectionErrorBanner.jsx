import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ConnectionErrorBanner({ onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <WifiOff className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">Couldn't load reports</p>
        <p className="text-sm text-red-700 dark:text-red-400">
          Check your internet connection and try again.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RefreshCw /> Retry Connection
      </Button>
    </div>
  )
}
