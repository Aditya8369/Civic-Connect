import { PageHeader } from '@/components/common/PageHeader'
import { NotificationCenter } from '@/components/NotificationCenter'

export function NotificationsPage() {
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stay updated on your reports"
      />
      <NotificationCenter />
    </div>
  )
}

export { NotificationCenter }
