import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from '@/components/common/ProtectedRoute'
import { CitizenLayout } from '@/layouts/CitizenLayout'
import { AdminLayout } from '@/layouts/AdminLayout'
import { HomePage } from '@/pages/HomePage'
import { AuthPage } from '@/pages/auth/AuthPage'
import { DashboardPage } from '@/pages/citizen/DashboardPage'
import { ReportPage } from '@/pages/citizen/ReportPage'
import { MyReportsPage } from '@/pages/citizen/MyReportsPage'
import { NotificationsPage } from '@/pages/citizen/NotificationsPage'
import { ProfilePage } from '@/pages/citizen/ProfilePage'
import { ComplaintDetailsPage } from '@/pages/citizen/ComplaintDetailsPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminReportsPage } from '@/pages/admin/AdminReportsPage'
import { AdminComplaintDetailsPage } from '@/pages/admin/AdminComplaintDetailsPage'
import { AdminNotificationsPage } from '@/pages/admin/AdminNotificationsPage'
import { AdminSettingsPage } from '@/pages/admin/AdminSettingsPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { HelpPage } from '@/pages/citizen/HelpPage'

export function AppRoutes() {
  return (
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
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
