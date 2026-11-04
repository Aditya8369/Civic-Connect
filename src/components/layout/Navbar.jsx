import { useState, useEffect, useRef } from 'react'
import { Menu, Bell } from 'lucide-react'
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

const icons = {
  new_complaint: '🔔',
  status_update: '✅',
}

export function Navbar({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unreadCount, setUnreadCount] = useState(0)
  const seenIds = useRef(new Set())

  useEffect(() => {
    if (!user) return
    const constraints = user.role === 'admin'
      ? [where('recipientRole', '==', 'admin'), where('read', '==', false)]
      : [where('recipientUid', '==', user.uid), where('read', '==', false)]
    const q = query(collection(db, 'notifications'), ...constraints)
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size)
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !seenIds.current.has(change.doc.id)) {
            seenIds.current.add(change.doc.id)
            const data = change.doc.data()
            const icon = icons[data.type] || '🔔'
            toast(`${icon} ${data.title}\n${data.message}`, { duration: 4000 })
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white/80 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80 px-4 sm:px-6">
      <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden rounded-full" aria-label="Open navigation menu">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      <ThemeToggle />

      <Button variant="ghost" size="icon" className="relative rounded-full" onClick={handleBellClick} aria-label="View notifications">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

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