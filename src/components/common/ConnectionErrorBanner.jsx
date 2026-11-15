
import { RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/contexts/LanguageContext'

export function ConnectionErrorBanner({ onRetry }) {
  const { t } = useLanguage()

  return (
    <div
      role="alert"
      className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30"
    >
      <WifiOff className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />

      <div className="flex-1">
        <p className="text-sm font-medium text-red-800 dark:text-red-300">
          {t('connectionErrorTitle')}
        </p>

        <p className="text-sm text-red-700 dark:text-red-400">
          {t('connectionErrorDescription')}
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="shrink-0"
      >
        <RefreshCw />
        {t('retryConnection')}
      </Button>
    </div>
  )
}
