import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import toast from 'react-hot-toast'

export function useComplaints(userId = null, role = 'citizen') {
  const [complaints, setComplaints] = useState([])
  const [loading, setLoading] = useState(true)

  // 1. Fetch complaints in real-time based on user role
  useEffect(() => {
    setLoading(true)
    let q

    if (role === 'admin') {
      // Admins view all complaints ordered by creation date
      q = query(collection(db, 'complaints'), orderBy('createdAt', 'desc'))
    } else if (userId) {
      // Citizens view only their own complaints
      q = query(
        collection(db, 'complaints'),
        where('createdBy', '==', userId),
        orderBy('createdAt', 'desc')
      )
    } else {
      setComplaints([])
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        setComplaints(items)
        setLoading(false)
      },
      (error) => {
        console.error('Error fetching complaints:', error)
        toast.error('Failed to load complaints')
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [userId, role])

  // 2. CC-004 Fix: Atomic Complaint Creation using writeBatch
  const createComplaint = async (complaintData) => {
    if (!userId) throw new Error('User must be logged in to submit a complaint.')

    const batch = writeBatch(db)

    // Generate reference for new complaint
    const complaintRef = doc(collection(db, 'complaints'))

    // Generate formatted ticket ID (CMP-YYYY-XXXX)
    const currentYear = new Date().getFullYear()
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    const ticketId = `CMP-${currentYear}-${randomNum}`

    const newComplaint = {
      ...complaintData,
      ticketId,
      createdBy: userId,
      status: 'Pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    // Stage complaint document
    batch.set(complaintRef, newComplaint)

    // Stage initial notification document
    const notificationRef = doc(collection(db, 'notifications'))
    batch.set(notificationRef, {
      complaintId: complaintRef.id,
      userId: userId,
      message: `Your grievance ticket ${ticketId} has been registered successfully.`,
      read: false,
      createdAt: serverTimestamp(),
    })

    // Commit both writes atomically
    await batch.commit()
    toast.success(`Complaint registered: ${ticketId}`)
    return complaintRef.id
  }

  // 3. Update complaint status or worker assignment
  const updateComplaintStatus = async (complaintId, updates) => {
    const batch = writeBatch(db)
    const complaintRef = doc(db, 'complaints', complaintId)

    batch.update(complaintRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    })

    if (updates.createdBy) {
      const notificationRef = doc(collection(db, 'notifications'))
      batch.set(notificationRef, {
        complaintId,
        userId: updates.createdBy,
        message: `Status updated for ticket: ${updates.status || 'In Progress'}`,
        read: false,
        createdAt: serverTimestamp(),
      })
    }

    await batch.commit()
    toast.success('Complaint updated successfully')
  }

  return {
    complaints,
    loading,
    createComplaint,
    updateComplaintStatus,
  }
}