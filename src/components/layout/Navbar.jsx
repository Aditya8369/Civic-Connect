import { useState, useEffect, useRef } from 'react'
import { Menu, Bell, BellRing } from 'lucide-react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
import { showNativeNotification, getPushPermissionStatus, requestPushPermission } from '@/firebase/notifications'

const icons = {
  new_complaint: '🔔',
  status_update: '✅',
  department_assigned: '🏢',
}

export function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const [recentNotifications, setRecentNotifications] = useState([])
  const [permissionStatus, setPermissionStatus] = useState(() => getPushPermissionStatus())
  const [requestingPush, setRequestingPush] = useState(false)
  const seenIds = useRef(new Set())

  useEffect(() => {
    if (!user) return
    const constraints = user.role === 'admin'
      ? [where('recipientRole', '==', 'admin')]
      : [where('recipientUid', '==', user.uid)]
    const q = query(collection(db, 'notifications'), ...constraints)
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        list.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime() || 0
          const tb = b.createdAt?.toDate?.()?.getTime() || 0
          return tb - ta
        })
        setRecentNotifications(list)
        setUnreadCount(list.filter((n) => !n.read).length)

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !seenIds.current.has(change.doc.id)) {
            seenIds.current.add(change.doc.id)
            const data = change.doc.data()
            const icon = icons[data.type] || '🔔'
            toast(`${icon} ${data.title}\n${data.message}`, { duration: 4000 })
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
              showNativeNotification({
                title: data.title,
                message: data.message,
                issueId: data.issueId,
              })
            }
          }
        })
        snapshot.docs.forEach((doc) => seenIds.current.add(doc.id))
      },
      (error) => console.error('Navbar notifications error:', error)
    )
    return unsub
  }, [user])

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U'

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  const handleBellClick = () => {
    navigate(user?.role === 'admin' ? '/admin/notifications' : '/notifications')
  }

  const handleNotificationItemClick = (n) => {
    if (!n.issueId) {
      handleBellClick()
      return
    }
    if (user?.role === 'admin') {
      navigate(`/admin/reports/${n.issueId}`)
    } else {
      navigate(`/complaints/${n.issueId}`)
    }
  }

  const handleEnablePush = async () => {
    setRequestingPush(true)
    try {
      const res = await requestPushPermission(user?.uid)
      setPermissionStatus(res.status)
      if (res.status === 'granted') {
        toast.success('Real-time push notifications enabled!')
      } else if (res.status === 'denied') {
        toast('Push notifications were not enabled. You will still receive in-app alerts.', { icon: 'ℹ️' })
      }
    } catch (err) {
      console.error('Error enabling push notifications:', err)
    } finally {
      setRequestingPush(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80 px-4 sm:px-6">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden rounded-full" aria-label="Open navigation menu">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="View notifications">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 sm:w-96 p-0">
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBellClick}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 h-7 px-2"
            >
              View all
            </Button>
          </div>

          {/* Permission request flow in Notification dropdown */}
          {permissionStatus === 'default' && (
            <div className="p-3 bg-primary-50/60 dark:bg-primary-950/40 border-b border-primary-100 dark:border-primary-900/40">
              <div className="flex items-start gap-2.5">
                <BellRing className="h-4 w-4 text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">Enable push alerts?</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Get real-time browser alerts when an admin updates your complaints.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleEnablePush}
                    disabled={requestingPush}
                    className="mt-2 h-7 text-[11px] w-full"
                  >
                    {requestingPush ? 'Enabling...' : 'Enable Notifications'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Recent notifications preview */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
            {recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-500 dark:text-gray-400">
                No notifications yet
              </div>
            ) : (
              recentNotifications.slice(0, 5).map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleNotificationItemClick(n)}
                  className={`p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                    !n.read ? 'bg-primary-50/30 dark:bg-primary-900/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base shrink-0">{icons[n.type] || '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-medium ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {n.title}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-gray-100 dark:border-gray-800 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBellClick}
              className="text-xs w-full text-gray-600 dark:text-gray-300 h-8"
            >
              See all notifications
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{user?.name}</span>
              <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{user?.email}</span>
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
            <DropdownMenuItem onClick={() => navigate('/admin/settings')}>
              Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400">
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
