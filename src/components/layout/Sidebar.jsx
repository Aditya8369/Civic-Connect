
import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  Bell,
  User,
  LogOut,
  Shield,
  Settings,
  Flag,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'

const citizenLinks = [
  { to: '/dashboard', label: 'dashboard', icon: LayoutDashboard },
  { to: '/report', label: 'newComplaint', icon: PlusCircle },
  { to: '/my-reports', label: 'myReports', icon: ClipboardList },
  { to: '/notifications', label: 'notifications', icon: Bell },
  { to: '/profile', label: 'profile', icon: User },
  { to: '/help', label: 'helpSupport', icon: HelpCircle },
]

const adminLinks = [
  { to: '/admin/dashboard', label: 'dashboard', icon: Shield },
  { to: '/admin/reports', label: 'manageReports', icon: Flag },
  { to: '/admin/notifications', label: 'notifications', icon: Bell },
  { to: '/admin/settings', label: 'settings', icon: Settings },
]

export function Sidebar({ className }) {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const links = isAdmin ? adminLinks : citizenLinks

  const handleLogout = async () => {
    await logout()
    navigate('/auth')
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar',
        className
      )}
    >
      <div className="flex h-16 items-center gap-2.5 px-6 border-b border-white/5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
          <Flag className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-semibold text-white">CivicConnect</span>
      </div>

      <nav
        aria-label={t('primaryNavigation')}
        className="flex-1 space-y-1 px-3 py-4"
      >
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                isActive
                  ? 'bg-sidebar-active text-sidebar-text-active shadow-sm'
                  : 'text-sidebar-text hover:bg-sidebar-hover hover:text-white'
              )
            }
          >
            <link.icon className="h-5 w-5 shrink-0" />
            <span>{t(link.label)}</span>
          </NavLink>
        ))}
      </nav>

      <motion.button
        type="button"
        onClick={handleLogout}
        className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-text transition-all duration-200 hover:bg-red-600/10 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        whileTap={{ scale: 0.97 }}
      >
        <LogOut className="h-5 w-5 shrink-0" />
        <span>{t('logout')}</span>
      </motion.button>
    </aside>
  )
}
