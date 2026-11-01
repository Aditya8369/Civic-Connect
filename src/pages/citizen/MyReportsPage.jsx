import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, MapPin, CalendarDays, Eye, Pencil, Trash2, FileWarning, Plus } from 'lucide-react'
import { collection, query, where, onSnapshot, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/services'
import { getDisplayId } from '@/firebase/complaintId'
import { useAuth } from '@/hooks/useAuth'
import { sortByCreatedAtDesc } from '@/utils/sortByCreatedAtDesc'
import { PageHeader } from '@/components/common/PageHeader'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
}

function formatDate(timestamp) {
  if (!timestamp?.toDate) return ''
  return timestamp.toDate().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function MyReportsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    if (!user) {
      console.log('MyReports: user is null, skipping query')
      setLoading(false)
      return
    }
    console.log('MyReports: fetching issues for uid:', user.uid)
    setLoading(true)
    // No orderBy here: where + orderBy on another field needs a composite index,
    // so the results are sorted on the client instead.
    const q = query(
      collection(db, 'issues'),
      where('reportedBy', '==', user.uid)
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log('MyReports: received', list.length, 'documents')
        setComplaints(sortByCreatedAtDesc(list))
        setLoading(false)
      },
      (error) => {
        console.error('MyReports Firestore error:', error)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [user])

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
      toast.success('Complaint deleted successfully')
    } catch {
      toast.error('Failed to delete complaint')
    }
    setDeleteTarget(null)
  }

  const openEdit = (complaint) => {
    setEditTarget(complaint)
    setEditTitle(complaint.title)
    setEditDescription(complaint.description)
    setEditAddress(complaint.address)
  }

  const handleEditSave = async () => {
    if (!editTarget) return
    setSavingEdit(true)
    try {
      await updateDoc(doc(db, 'issues', editTarget.id), {
        title: editTitle,
        description: editDescription,
        address: editAddress,
        updatedAt: serverTimestamp(),
      })
      toast.success('Complaint updated successfully')
      setEditTarget(null)
    } catch {
      toast.error('Failed to update complaint')
    }
    setSavingEdit(false)
  }

  return (
    <div>
      <PageHeader
        title="My Reports"
        description="Track and manage your submitted complaints"
      />

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Search by complaint ID, title, or category..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <Card>
              <CardContent className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
              </CardContent>
            </Card>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sm:col-span-2 xl:col-span-3">
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FileWarning className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-sm font-medium text-gray-900 dark:text-white">No complaints found</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {searchQuery ? 'Try a different search term.' : "You haven't reported any civic issues yet."}
                </p>
                {!searchQuery && (
                  <Button onClick={() => navigate('/report')} variant="outline" size="sm" className="mt-4 gap-2">
                    <Plus className="h-4 w-4" /> New Complaint
                  </Button>
                )}
              </CardContent>
            </Card>
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
                      <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{getDisplayId(report)}</span>
                      <Badge variant={statusVariant[report.status] || 'default'} className="capitalize">
                        {report.status}
                      </Badge>
                    </div>
                    <h3 className="font-medium text-gray-900 dark:text-white leading-snug">
                      {report.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.category}</p>
                  </div>

                  <div className="mt-auto space-y-2">
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{report.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      <span>{formatDate(report.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs h-9"
                      onClick={() => navigate(`/report/${report.id}`)}
                    >
                      <Eye className="h-3.5 w-3.5" /> View Details
                    </Button>
                    {report.status === 'Pending' && (
                      <>
                        <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-9" onClick={() => openEdit(report)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-xs h-9 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => setDeleteTarget(report)}
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

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Complaint</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this complaint? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Complaint</DialogTitle>
            <DialogDescription>Update the details of your pending complaint.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <textarea
                id="edit-desc"
                rows={3}
                className="flex w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 resize-none"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-addr">Address</Label>
              <Input id="edit-addr" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={savingEdit}>
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
