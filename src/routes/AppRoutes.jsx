import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { CitizenLayout } from '@/layouts/CitizenLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { PageSkeleton } from '@/components/common/PageSkeleton'

const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const AuthPage = lazy(() => import('@/pages/auth/AuthPage').then((m) => ({ default: m.AuthPage })))
const DashboardPage = lazy(() => import('@/pages/citizen/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ReportPage = lazy(() => import('@/pages/citizen/ReportPage').then((m) => ({ default: m.ReportPage })))
const MyReportsPage = lazy(() => import('@/pages/citizen/MyReportsPage').then((m) => ({ default: m.MyReportsPage })))
const ComplaintConfirmationPage = lazy(() =>
  import('@/pages/citizen/ComplaintConfirmationPage').then((m) => ({
    default: m.ComplaintConfirmationPage,
  }))
)
const NotificationsPage = lazy(() => import('@/pages/citizen/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const ProfilePage = lazy(() => import('@/pages/citizen/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const ComplaintDetailsPage = lazy(() => import('@/pages/citizen/ComplaintDetailsPage').then((m) => ({ default: m.ComplaintDetailsPage })))
const HelpPage = lazy(() => import('@/pages/citizen/HelpPage').then((m) => ({ default: m.HelpPage })))

const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminReportsPage = lazy(() => import('@/pages/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })))
const AdminComplaintDetailsPage = lazy(() => import('@/pages/admin/AdminComplaintDetailsPage').then((m) => ({ default: m.AdminComplaintDetailsPage })))
const AdminNotificationsPage = lazy(() => import('@/pages/admin/AdminNotificationsPage').then((m) => ({ default: m.AdminNotificationsPage })))
const AdminBroadcastPage = lazy(() => import('@/pages/admin/AdminBroadcastPage').then((m) => ({ default: m.AdminBroadcastPage })))
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })))

const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />

        <Route
          element={
            <ProtectedRoute requiredRole="citizen">
              <CitizenLayout />
            </ProtectedRoute>
          }
        >
                    <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/my-reports" element={<MyReportsPage />} />

          <Route
            path="/complaint-confirmation"
            element={<ComplaintConfirmationPage />}
          />

          <Route path="/report/:id" element={<ComplaintDetailsPage />} />
          <Route path="/complaints/:id" element={<ComplaintDetailsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>

        <Route
          element={
            <ProtectedRoute requiredRole="admin">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/reports/:id" element={<AdminComplaintDetailsPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/broadcasts" element={<AdminBroadcastPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}
