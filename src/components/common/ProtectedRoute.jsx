
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'

export function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const { t } = useLanguage()

  if (loading) {
    return (
      <div
        role="status"
        aria-label={t('verifyingAuthentication')}
        className="flex h-screen items-center justify-center"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        <span className="sr-only">{t('pleaseWait')}</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  if (requiredRole && user.role !== requiredRole) {
    if (user.role === 'admin') {
      return <Navigate to="/admin/dashboard" replace />
    }

    return <Navigate to="/dashboard" replace />
  }

  return children
}
