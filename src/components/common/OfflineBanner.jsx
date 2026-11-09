import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

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
      className="flex items-center justify-center gap-2 bg-red-600 px-4 py-3 text-sm font-medium text-white"
    >
      <WifiOff className="h-5 w-5" />
      You are offline. Your internet connection is unavailable.
      Your pending complaints will be saved locally.
    </div>
  )
}