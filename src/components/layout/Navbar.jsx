import { useState, useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { useAuth } from '@/hooks/useAuth'
import { ThemeToggle } from '@/components/common/ThemeToggle'
import { NotificationDropdown } from '@/components/notifications/NotificationDropdown'
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

  const handleOptimisticMarkAllAsRead = () => {
    setRecentNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleOptimisticToggleRead = (id, newStatus) => {
    setRecentNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: newStatus } : n))
    )
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

      <NotificationDropdown
        notifications={recentNotifications}
        onNotificationClick={handleNotificationItemClick}
        onViewAll={handleBellClick}
        onMarkAllAsRead={handleOptimisticMarkAllAsRead}
        onToggleRead={handleOptimisticToggleRead}
        permissionStatus={permissionStatus}
        onRequestPush={handleEnablePush}
        requestingPush={requestingPush}
      />

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
