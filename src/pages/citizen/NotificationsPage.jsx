
import { PageHeader } from '@/components/common/PageHeader'
import { NotificationCenter } from '@/components/NotificationCenter'
import { useLanguage } from '@/contexts/LanguageContext'

export function NotificationsPage() {
  const { t } = useLanguage()

  return (
    <div>
      <PageHeader
        title={t('notifications')}
        description={t('notificationsDescription')}
      />
      <NotificationCenter />
    </div>
  )
}

export { NotificationCenter }

