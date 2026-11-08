import { useState, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/layout/Sidebar'
import { Navbar } from '@/components/layout/Navbar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { PageSkeleton } from '@/components/common/PageSkeleton'

export function CitizenLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {isDesktop && <Sidebar className="hidden lg:flex" />}
      <MobileSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden lg:pl-64">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="page-container">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  )
}
