
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { t } = useLanguage()

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('offlineStatus')}
      className="flex items-center justify-center gap-2 bg-red-600 px-4 py-3 text-sm font-medium text-white"
    >
      <WifiOff className="h-5 w-5" aria-hidden="true" />
      <span>{t('offlineMessage')}</span>
    </div>
  )
}
