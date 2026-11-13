import { useState, useMemo, useEffect } from 'react'
import { Bell, CheckCheck, Check, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatRelativeTime } from '@/utils/relativeTime'
import { NOTIFICATION_TABS, matchesCategory } from '@/utils/notificationCategories'
import { markNotificationAsRead, markAllNotificationsAsRead } from '@/firebase/notifications'
import toast from 'react-hot-toast'

const defaultIcons = {
  new_complaint: '🔔',
  status_update: '✅',
  department_assigned: '🏢',
  announcement: '📢',
  mention: '💬',
}

export function InboxClearedIllustration({ className = 'w-20 h-20' }) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="60" cy="60" r="48" className="fill-primary-50 dark:fill-primary-950/40" />
      <circle cx="60" cy="60" r="36" className="fill-primary-100/60 dark:fill-primary-900/30" />
      <path
        d="M28 32L30 26L32 32L38 34L32 36L30 42L28 36L22 34L28 32Z"
        className="fill-amber-400"
      />
      <path
        d="M90 36L91.5 31L93 36L98 37.5L93 39L91.5 44L90 39L85 37.5L90 36Z"
        className="fill-primary-400"
      />
      <path
        d="M84 84L85 80L86 84L90 85L86 86L85 90L84 86L80 85L84 84Z"
        className="fill-amber-300"
      />
      <path
        d="M60 36C52.268 36 46 42.268 46 50V63L41 68V71H79V68L74 63V50C74 42.268 67.732 36 60 36Z"
        className="fill-white dark:fill-gray-900 stroke-primary-600 dark:stroke-primary-400"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M55 71C55 73.7614 57.2386 76 60 76C62.7614 76 65 73.7614 65 71"
        className="stroke-primary-600 dark:stroke-primary-400"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="74" cy="46" r="12" className="fill-emerald-500" />
      <path
        d="M69.5 46L72.5 49L78.5 43"
        className="stroke-white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function NotificationDropdown({
  notifications = [],
  onNotificationClick,
  onViewAll,
  onMarkAllAsRead,
  onToggleRead,
  permissionStatus,
  onRequestPush,
  requestingPush = false,
  className = '',
  open,
  defaultOpen,
  onOpenChange,
}) {
  const [activeTab, setActiveTab] = useState('all')
  const [localNotifications, setLocalNotifications] = useState(notifications)
  const [isUpdating, setIsUpdating] = useState(false)

  // Sync external notifications when passed
  useEffect(() => {
    setLocalNotifications(notifications)
  }, [notifications])

  const unreadCount = useMemo(() => {
    return localNotifications.filter((n) => !n.read).length
  }, [localNotifications])

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = {}
    NOTIFICATION_TABS.forEach((tab) => {
      counts[tab.id] = localNotifications.filter((n) => matchesCategory(n, tab.id)).length
    })
    return counts
  }, [localNotifications])

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return localNotifications.filter((n) => matchesCategory(n, activeTab))
  }, [localNotifications, activeTab])

  // 1-Click "Mark all as read" with immediate optimistic UI update
  const handleMarkAllAsRead = async (e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()

    if (isUpdating) return

    const unreadItems = localNotifications.filter((n) => !n.read)
    if (unreadItems.length === 0) {
      toast('All notifications are already marked as read', { id: 'mark-all-read', icon: '✅' })
      return
    }

    const previousState = [...localNotifications]
    const unreadIds = unreadItems.map((n) => n.id)

    // Immediate optimistic UI update
    setLocalNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    onMarkAllAsRead?.()
    setIsUpdating(true)

    try {
      await markAllNotificationsAsRead(unreadIds)
      toast.success('All notifications marked as read', { id: 'mark-all-read' })
    } catch (err) {
      console.error('Failed to mark all as read:', err)
      // Rollback on failure
      setLocalNotifications(previousState)
      toast.error('Failed to update notifications')
    } finally {
      setIsUpdating(false)
    }
  }

  // Interactive toggle mark-as-read for single item with immediate optimistic UI update
  const handleToggleRead = async (notification, e) => {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    const targetId = notification.id
    const targetStatus = !notification.read

    const previousState = [...localNotifications]

    // Immediate optimistic update
    setLocalNotifications((prev) =>
      prev.map((n) => (n.id === targetId ? { ...n, read: targetStatus } : n))
    )
    onToggleRead?.(targetId, targetStatus)

    try {
      await markNotificationAsRead(targetId, targetStatus)
    } catch (err) {
      console.error(`Failed to mark notification as ${targetStatus ? 'read' : 'unread'}:`, err)
      // Rollback on failure
      setLocalNotifications(previousState)
      toast.error('Failed to update notification')
    }
  }

  const handleItemClick = (n) => {
    // If clicking an unread item, optimistically mark it as read too
    if (!n.read) {
      setLocalNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item))
      )
      try {
        const res = markNotificationAsRead(n.id, true)
        if (res && typeof res.catch === 'function') {
          res.catch(() => {})
        }
      } catch {
        // ignore error during background read
      }
    }
    onNotificationClick?.(n)
  }

  return (
    <DropdownMenu open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`relative rounded-full transition-transform active:scale-90 duration-150 ${className}`}
          aria-label="View notifications"
        >
          <Bell className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          {unreadCount > 0 && (
            <span
              data-testid="unread-badge"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none shadow-xs animate-in zoom-in-75 duration-150"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[340px] sm:w-[400px] p-0 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 overflow-hidden"
      >
        {/* Dropdown Header */}
        <div className="p-3.5 border-b border-gray-100 dark:border-gray-800/80 bg-gray-50/50 dark:bg-gray-900/40">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Activity
              </span>
              {unreadCount > 0 ? (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                  {unreadCount} unread
                </span>
              ) : (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">All caught up</span>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleMarkAllAsRead}
              disabled={isUpdating}
              className="text-xs h-7 px-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Mark all as read
            </Button>
          </div>

          {/* Category Filter Tabs */}
          <div
            className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar"
            role="tablist"
            aria-label="Notification category tabs"
          >
            {NOTIFICATION_TABS.map((tab) => {
              const isSelected = activeTab === tab.id
              const count = tabCounts[tab.id] || 0
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isSelected}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setActiveTab(tab.id)
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'bg-gray-900 text-white shadow-xs dark:bg-gray-100 dark:text-gray-900'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                        isSelected
                          ? 'bg-white/20 text-white dark:bg-black/20 dark:text-gray-900'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Optional Push Permission Banner */}
        {permissionStatus === 'default' && (
          <div className="p-3 bg-primary-50/70 dark:bg-primary-950/40 border-b border-primary-100 dark:border-primary-900/40">
            <div className="flex items-start gap-2.5">
              <BellRing className="h-4 w-4 text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-900 dark:text-white">
                  Enable push alerts?
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                  Get real-time browser alerts when complaints are updated.
                </p>
                <Button
                  size="sm"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onRequestPush}
                  disabled={requestingPush}
                  className="mt-2 h-7 text-[11px] w-full"
                >
                  {requestingPush ? 'Enabling...' : 'Enable Notifications'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Activity Feed */}
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800/80">
          {filteredNotifications.length === 0 ? (
            <div
              data-testid="notification-empty-state"
              className="py-10 px-4 flex flex-col items-center justify-center text-center"
            >
              <InboxClearedIllustration className="w-16 h-16 mb-2.5" />
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {activeTab === 'all' ? 'All caught up!' : 'No updates in this tab'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-[240px]">
                {activeTab === 'all'
                  ? "You've read all your notifications. New activity will show up here."
                  : 'Check back later for new updates in this category.'}
              </p>
            </div>
          ) : (
            filteredNotifications.slice(0, 10).map((n) => {
              const icon = defaultIcons[n.type] || '🔔'
              const formattedTime = formatRelativeTime(n.createdAt)

              return (
                <div
                  key={n.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => handleItemClick(n)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleItemClick(n)
                    }
                  }}
                  className={`group relative p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-900/60 cursor-pointer transition-colors flex items-start gap-3 ${
                    !n.read
                      ? 'bg-primary-50/30 dark:bg-primary-950/20'
                      : 'bg-transparent opacity-85 hover:opacity-100'
                  }`}
                >
                  {/* Category icon / emoji */}
                  <span className="text-base shrink-0 mt-0.5 select-none">{icon}</span>

                  {/* Notification Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1.5">
                      <p
                        className={`text-xs ${
                          !n.read
                            ? 'font-semibold text-gray-900 dark:text-white'
                            : 'font-medium text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {n.title}
                      </p>
                      {formattedTime && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
                          {formattedTime}
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5 leading-relaxed">
                      {n.message}
                    </p>

                    {n.issueId && (
                      <span className="inline-block text-[10px] font-mono text-primary-600 dark:text-primary-400 mt-1">
                        {n.issueId}
                      </span>
                    )}
                  </div>

                  {/* Interactive Mark-As-Read Toggle with Tactile Styling */}
                  <button
                    type="button"
                    title={n.read ? 'Mark as unread' : 'Mark as read'}
                    aria-label={n.read ? 'Mark as unread' : 'Mark as read'}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => handleToggleRead(n, e)}
                    className="shrink-0 p-1 rounded-full text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition-transform active:scale-90"
                  >
                    {!n.read ? (
                      <span
                        data-testid="unread-indicator-dot"
                        className="flex h-2.5 w-2.5 rounded-full bg-primary-600 dark:bg-primary-400 ring-2 ring-primary-100 dark:ring-primary-900"
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400" />
                    )}
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Dropdown Footer */}
        <div className="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 text-center">
          <Button
            variant="ghost"
            size="sm"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onViewAll}
            className="text-xs w-full text-gray-600 dark:text-gray-300 h-7 hover:text-primary-600 dark:hover:text-primary-400"
          >
            See all notifications
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

