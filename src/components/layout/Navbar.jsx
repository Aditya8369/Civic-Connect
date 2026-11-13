import { resolveCitizenComplaintDocumentId } from '@/firebase/complaintReferences'
import { useState, useEffect, useRef } from 'react'
import { Menu, Bell, BellRing, Search } from 'lucide-react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { useSpotlightSearch } from '@/contexts/SpotlightContext'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/firebase/notificationPreferences'
import { playNotificationSound } from '@/utils/notificationAudio'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  showNativeNotification,
  getPushPermissionStatus,
  requestPushPermission,
} from '@/firebase/notifications'

const icons = {
  new_complaint: '🔔',
  status_update: '✅',
  department_assigned: '🏢',
}

export function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { openSearch } = useSpotlightSearch()

  const [unreadCount, setUnreadCount] = useState(0)
  const [recentNotifications, setRecentNotifications] = useState([])
  const [permissionStatus, setPermissionStatus] = useState(() =>
    getPushPermissionStatus()
  )
  const [requestingPush, setRequestingPush] = useState(false)

  const seenIds = useRef(new Set())

  useEffect(() => {
    if (!user?.uid) return

    // Reset notification tracking when the signed-in account changes.
    seenIds.current = new Set()

    let isInitialSnapshot = true

    const constraints =
      user.role === 'admin'
        ? [where('recipientRole', '==', 'admin')]
        : [where('recipientUid', '==', user.uid)]

    const q = query(collection(db, 'notifications'), ...constraints)

    const unsub = onSnapshot(
      q,
      async (snapshot) => {
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        list.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime() || 0
          const tb = b.createdAt?.toDate?.()?.getTime() || 0
          return tb - ta
        })

        setRecentNotifications(list)
        setUnreadCount(list.filter((notification) => !notification.read).length)

        // The initial snapshot contains existing notifications.
        // Track them without showing alerts or playing sounds.
        if (isInitialSnapshot) {
          snapshot.docs.forEach((doc) => {
            seenIds.current.add(doc.id)
          })

          isInitialSnapshot = false
          return
        }

        // Load current preferences so changes made in Settings are respected.
        const preferences = await loadNotificationPreferences(user.uid)

        snapshot.docChanges().forEach((change) => {
          if (
            change.type !== 'added' ||
            seenIds.current.has(change.doc.id)
          ) {
            return
          }

          seenIds.current.add(change.doc.id)

          const data = change.doc.data()
          const icon = icons[data.type] || '🔔'

          // Show an in-app notification.
          toast(`${icon} ${data.title}\n${data.message}`, {
            duration: 4000,
          })

          // Play sound only for supported notification types when enabled.
          if (
            preferences.sound &&
            ['status_update', 'new_complaint'].includes(data.type)
          ) {
            playNotificationSound()
          }

          // Show a native browser notification only when push is enabled
          // and the browser tab is hidden.
          if (
            preferences.push &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'hidden'
          ) {
            showNativeNotification({
              title: data.title,
              message: data.message,
              issueId: data.issueId,
            })
          }
        })

        // Track all current notification IDs to avoid duplicate alerts.
        snapshot.docs.forEach((doc) => {
          seenIds.current.add(doc.id)
        })
      },
      (error) => {
        console.error('Navbar notifications error:', error)
      }
    )

    return unsub
  }, [user?.uid, user?.role])

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((name) => name[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U'

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  const handleBellClick = () => {
    navigate(
      user?.role === 'admin'
        ? '/admin/notifications'
        : '/notifications'
    )
  }

  const handleNotificationItemClick = async (notification) => {
    if (!notification.issueId) {
      handleBellClick()
      return
    }

    // Preserve existing admin navigation.
    if (user?.role === 'admin') {
      navigate(`/admin/reports/${notification.issueId}`)
      return
    }

    // Resolve citizen notification references securely.
    try {
      const documentId = await resolveCitizenComplaintDocumentId(
        notification.issueId,
        user?.uid,
      )

      if (!documentId) {
        toast.error('Complaint not found or you do not have access.')
        return
      }

      navigate(`/complaints/${documentId}`)
    } catch (err) {
      console.error('Error opening notification complaint:', err)
      toast.error('Unable to open complaint. Please try again.')
    }
  }

  const handleEnablePush = async () => {
    if (!user?.uid || requestingPush) return

    setRequestingPush(true)

    try {
      const result = await requestPushPermission(user.uid)

      setPermissionStatus(result.status)

      if (result.status === 'granted') {
        await saveNotificationPreferences(user.uid, {
          push: true,
        })

        toast.success('Real-time push notifications enabled!')
      } else if (result.status === 'denied') {
        toast(
          'Push notifications were not enabled. You will still receive in-app alerts.',
          { icon: 'ℹ️' }
        )
      }
    } catch (error) {
      console.error('Error enabling push notifications:', error)

      toast.error('Could not enable push notifications.')
    } finally {
      setRequestingPush(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 px-4 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80 sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        className="rounded-full lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Global Spotlight Search Trigger */}
      <div className="flex-1 max-w-xs sm:max-w-sm">
        <button
          type="button"
          onClick={openSearch}
          className="group flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-xs text-gray-500 transition-all hover:border-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-400 dark:hover:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          aria-label="Search reports (Ctrl+K or Cmd+K)"
        >
          <Search className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300" />
          <span className="flex-1 text-left truncate">Search reports, wards...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-gray-400 shadow-2xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
            <span className="text-xs">{typeof navigator !== 'undefined' && navigator.platform?.toUpperCase()?.includes('MAC') ? '⌘' : 'Ctrl+'}</span>K
          </kbd>
        </button>
      </div>

      <div className="flex-1" />

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
            aria-label="View notifications"
          >
            <Bell className="h-5 w-5" />

            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Notifications
              </p>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                {unreadCount > 0
                  ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`
                  : 'All caught up'}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleBellClick}
              className="h-7 px-2 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              View all
            </Button>
          </div>

          {/* Browser notification permission request */}
          {permissionStatus === 'default' && (
            <div className="border-b border-primary-100 bg-primary-50/60 p-3 dark:border-primary-900/40 dark:bg-primary-950/40">
              <div className="flex items-start gap-2.5">
                <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />

                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    Enable push alerts?
                  </p>

                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    Get real-time browser alerts when an admin updates your complaints.
                  </p>

                  <Button
                    size="sm"
                    onClick={handleEnablePush}
                    disabled={requestingPush}
                    className="mt-2 h-7 w-full text-[11px]"
                  >
                    {requestingPush
                      ? 'Enabling...'
                      : 'Enable Notifications'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Recent notifications preview */}
          <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
            {recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                No notifications yet
              </div>
            ) : (
              recentNotifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  onClick={() =>
                    handleNotificationItemClick(notification)
                  }
                  className={`cursor-pointer p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                    !notification.read
                      ? 'bg-primary-50/30 dark:bg-primary-900/10'
                      : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 text-base">
                      {icons[notification.type] || '🔔'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-medium ${
                          !notification.read
                            ? 'text-gray-900 dark:text-white'
                            : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {notification.title}
                      </p>

                      <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">
                        {notification.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-gray-100 p-2 text-center dark:border-gray-800">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBellClick}
              className="h-8 w-full text-xs text-gray-600 dark:text-gray-300"
            >
              See all notifications
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full p-0"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary-100 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {user?.name}
              </span>

              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                {user?.email}
              </span>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate('/profile')}>
            Profile
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleBellClick}>
            Notifications
          </DropdownMenuItem>

          {user?.role === 'admin' && (
            <DropdownMenuItem
              onClick={() => navigate('/admin/settings')}
            >
              Settings
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleLogout}
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          >
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
