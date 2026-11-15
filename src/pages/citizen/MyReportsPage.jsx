
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, MapPin, CalendarDays, Eye, Pencil, Trash2 } from 'lucide-react'
import { collection, query, where, onSnapshot, doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { isUnconfirmedEmpty } from '@/firebase/snapshot'
import { useAuth } from '@/hooks/useAuth'
import { sortByCreatedAtDesc } from '@/utils/sortByCreatedAtDesc'
import { PageHeader } from '@/components/common/PageHeader'
import { ComplaintCardSkeleton } from '@/components/common/ComplaintCardSkeleton'
import { ConnectionErrorBanner } from '@/components/common/ConnectionErrorBanner'
import { EmptyState } from '@/components/common/EmptyState'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DepartmentCrest, CategoryAvatar } from '@/components/common/DepartmentCrest'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import toast from 'react-hot-toast'
import { useComplaintEditSave } from '@/hooks/useComplaintEditSave'
import { useLanguage } from '@/contexts/LanguageContext'

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
  'Merged - Duplicate': 'secondary',
}

const statusTranslationKeys = {
  Resolved: 'statusResolved',
  'In Progress': 'statusInProgress',
  Pending: 'statusPending',
  Rejected: 'statusRejected',
  Reopened: 'statusReopened',
  'Merged - Duplicate': 'statusMerged',
}

function formatDate(timestamp, language) {
  if (!timestamp?.toDate) return ''

  return timestamp.toDate().toLocaleDateString(
    language === 'hi' ? 'hi-IN' : 'en-US',
    {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }
  )
}

export function MyReportsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t, language } = useLanguage()

  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAddress, setEditAddress] = useState('')

  const { savingEdit, saveEdit } = useComplaintEditSave()

  useEffect(() => {
    if (!user) {
      console.log('MyReports: user is null, skipping query')
      setLoading(false)
      return
    }

    console.log('MyReports: fetching issues for uid:', user.uid)
    setLoading(true)
    setLoadError(false)

    // No orderBy here: where + orderBy on another field needs a composite index,
    // so the results are sorted on the client instead.
    const q = query(
      collection(db, 'issues'),
      where('reportedBy', '==', user.uid)
    )

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (isUnconfirmedEmpty(snapshot)) {
          if (!navigator.onLine) {
            setLoadError(true)
            setLoading(false)
          }
          return
        }

        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        console.log('MyReports: received', list.length, 'documents')
        setComplaints(sortByCreatedAtDesc(list))
        setLoadError(false)
        setLoading(false)
      },
      (error) => {
        console.error('MyReports Firestore error:', error)
        setLoadError(true)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [user, reloadKey])

  const filtered = complaints.filter(
    (r) =>
      r.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.complaintId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await deleteDoc(doc(db, 'issues', deleteTarget.id))
      toast.success(t('complaintDeletedSuccessfully'))
    } catch {
      toast.error(t('failedToDeleteComplaint'))
    }

    setDeleteTarget(null)
  }

  const openEdit = (complaint) => {
    setEditTarget(complaint)
    setEditTitle(complaint.title)
    setEditDescription(complaint.description)
    setEditAddress(complaint.address)
  }

  const handleEditSave = () =>
    saveEdit(
      editTarget,
      {
        title: editTitle,
        description: editDescription,
        address: editAddress,
      },
      user?.uid,
      () => setEditTarget(null)
    )

  const getStatusLabel = (status) => {
    const key = statusTranslationKeys[status]
    return key ? t(key) : status
  }

  return (
    <div>
      <PageHeader
        title={t('myReports')}
        description={t('myReportsDescription')}
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />

        <Input
          className="pl-9"
          placeholder={t('searchMyReports')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        aria-busy={loading}
      >
        {loadError ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <ConnectionErrorBanner
              onRetry={() => setReloadKey((k) => k + 1)}
            />
          </div>
        ) : loading ? (
          Array.from({ length: 6 }, (_, i) => (
            <ComplaintCardSkeleton key={i} />
          ))
        ) : complaints.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <EmptyState
              variant="reports"
              heading={t('noReportsYet')}
              description={t('noReportsDescription')}
              actionLabel={t('reportAnIssue')}
              onAction={() => navigate('/report')}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <EmptyState
              variant="reports"
              heading={t('noComplaintsFound')}
              description={t('noComplaintsFoundDescription')}
              actionLabel={t('clearSearch')}
              actionVariant="outline"
              onAction={() => setSearchQuery('')}
            />
          </div>
        ) : (
          filtered.map((report, index) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.04 }}
            >
              <Card className="group transition-all duration-200 hover:shadow-card-hover h-full flex flex-col">
                <CardContent className="p-5 flex flex-col h-full">
                  <div className="mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                        {getDisplayId(report)}
                      </span>

                      <Badge
                        variant={statusVariant[report.status] || 'default'}
                        className="capitalize"
                      >
                        {getStatusLabel(report.status)}
                      </Badge>
                    </div>

                    <h3 className="font-medium text-gray-900 dark:text-white leading-snug">
                      {report.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <DepartmentCrest
                        department={report.department}
                        category={report.category}
                        size="xs"
                        variant="chip"
                      />

                      {report.category && (
                        <CategoryAvatar
                          category={report.category}
                          size="xs"
                        />
                      )}
                    </div>

                    {report.status === 'Merged - Duplicate' &&
                      report.mergedInto && (
                        <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mt-1">
                          {t('consolidatedInto')} {report.mergedInto}
                        </p>
                      )}
                  </div>

                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{report.address}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(report.createdAt, language)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-9"
                      onClick={() => navigate(`/report/${report.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {t('viewDetails')}
                    </Button>

                    {report.status === 'Pending' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs h-9"
                          onClick={() => openEdit(report)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('edit')}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs h-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setDeleteTarget(report)}
                          aria-label={t('deleteComplaint')}
                          title={t('deleteComplaint')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteComplaint')}</DialogTitle>
            <DialogDescription>
              {t('deleteComplaintConfirmation')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
            >
              {t('cancel')}
            </Button>

            <Button variant="destructive" onClick={handleDelete}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open && !savingEdit) setEditTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editComplaint')}</DialogTitle>
            <DialogDescription>
              {t('updatePendingComplaint')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('title')}</Label>
              <Input
                id="edit-title"
                disabled={savingEdit}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-desc">{t('description')}</Label>
              <textarea
                id="edit-desc"
                disabled={savingEdit}
                rows={3}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 resize-none"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-addr">{t('address')}</Label>
              <Input
                id="edit-addr"
                disabled={savingEdit}
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={savingEdit}
              onClick={() => setEditTarget(null)}
            >
              {t('cancel')}
            </Button>

            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? t('saving') : t('saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
