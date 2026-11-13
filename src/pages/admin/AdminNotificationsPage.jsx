import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { collection, query, where, onSnapshot, doc, writeBatch, getDocs, limit } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { PageHeader } from '@/components/common/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { formatRelativeTime } from '@/utils/relativeTime'

function sortByCreatedDesc(list) {
  return [...list].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime() || 0
    const tb = b.createdAt?.toDate?.()?.getTime() || 0
    return tb - ta
  })
}

export function AdminNotificationsPage() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  const handleNotificationClick = async (n) => {
    if (!n.issueId) return

    try {
      const q = query(
        collection(db, 'issues'),
        where('complaintId', '==', n.issueId),
        limit(1)
      )
      const snap = await getDocs(q)
      if (!snap.empty) {
        navigate(`/admin/reports/${snap.docs[0].id}`)
        return
      }
      navigate(`/admin/reports/${n.issueId}`)
    } catch (err) {
      console.error('Error navigating to complaint:', err)
      navigate(`/admin/reports/${n.issueId}`)
    }
  }

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      where('recipientRole', '==', 'admin')
    )
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        setNotifications(sortByCreatedDesc(list))
        setLoading(false)
        const unread = list.filter((n) => !n.read)
        if (unread.length > 0) {
          const batch = writeBatch(db)
          unread.forEach((n) => {
            batch.update(doc(db, 'notifications', n.id), { read: true })
          })
          batch.commit().catch((err) => console.error('batch commit error:', err))
        }
      },
      (error) => {
        console.error('AdminNotifications Firestore error:', error)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Real-time updates from citizens"
      />

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
          </CardContent>
        </Card>
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Bell className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-sm font-medium text-gray-900 dark:text-white">No notifications yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              You will receive notifications when citizens submit new complaints.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                !n.read
                  ? 'bg-primary-50/50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
              }`}
            >
              <span className="text-xl shrink-0 mt-0.5">🔔</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium ${!n.read ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {n.title}
                  </p>
                  <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 whitespace-nowrap">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                {n.issueId && (
                  <p className="text-xs font-mono text-primary-600 dark:text-primary-400 mt-1">{n.issueId}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}