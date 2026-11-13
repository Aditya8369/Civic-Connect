export const NOTIFICATION_TABS = [
  { id: 'all', label: 'All' },
  { id: 'status', label: 'Status Updates' },
  { id: 'announcement', label: 'Announcements' },
  { id: 'mention', label: 'Mentions' },
]

export function matchesCategory(notification, tabId) {
  if (!notification) return false
  if (tabId === 'all') return true

  const type = notification.type || ''
  const category = notification.category || ''

  if (tabId === 'status') {
    return (
      type === 'status_update' ||
      type === 'department_assigned' ||
      type === 'new_complaint' ||
      category === 'status' ||
      category === 'status_update'
    )
  }

  if (tabId === 'announcement') {
    return (
      type === 'announcement' ||
      type === 'broadcast' ||
      category === 'announcement'
    )
  }

  if (tabId === 'mention') {
    return type === 'mention' || category === 'mention'
  }

  return false
}

