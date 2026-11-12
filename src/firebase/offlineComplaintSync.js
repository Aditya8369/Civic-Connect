import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query,
  runTransaction, serverTimestamp, startAt, where,
} from 'firebase/firestore'
import { auth, db } from './services'
import { allocateComplaintId } from './complaintId'
import { addComplaintEventToBatch } from './complaintEvents'
import { addNotificationToBatch } from './notifications'
import { uploadComplaintPhoto } from './storage'

export function normalizePhotoFile(complaint) {
  const photo = complaint?.photoFile || complaint?.photoBlob
  if (!photo) return null

  const name = photo.name || complaint?.photoName || 'evidence.jpg'
  const type = photo.type || complaint?.photoType || photo.blob?.type || 'image/jpeg'
  const blob = photo.blob || photo

  if (typeof File !== 'undefined') {
    if (photo instanceof File && photo.name) {
      return photo
    }
    try {
      return new File([blob], name, { type })
    } catch {
      // Continue to fallback
    }
  }

  if (!blob.name) {
    try {
      Object.defineProperty(blob, 'name', { value: name, configurable: true, writable: true })
    } catch {}
  }
  if (!blob.type) {
    try {
      Object.defineProperty(blob, 'type', { value: type, configurable: true, writable: true })
    } catch {}
  }
  return blob
}

export function syncOfflineComplaint(complaint, session, options = {}) {
  const { localId, userId } = complaint
  const issueRef = doc(db, 'issues', localId)
  const receiptRef = doc(db, 'users', userId, 'offlineComplaintReceipts', localId)
  const uploadPhoto = options.uploadPhoto || uploadComplaintPhoto

  function assertCurrentSession() {
    if (!session || session.uid !== userId || auth.currentUser !== session) {
      throw new Error('Your sign-in session changed before the complaint could sync')
    }
  }

  assertCurrentSession()

  return (async () => {
    let photoUpload = null
    const photoFile = normalizePhotoFile(complaint)
    if (photoFile) {
      photoUpload = await uploadPhoto(photoFile, localId)
    }

    assertCurrentSession()

    const imageUrl = photoUpload?.downloadUrl || null
    const photos = photoUpload ? [photoUpload] : []

    return runTransaction(db, async transaction => {
      assertCurrentSession()
      const receipt = await transaction.get(receiptRef)
      assertCurrentSession()
      if (receipt.exists()) return

      // Older uploads have no receipt. Check the first owned document at or
      // after this ID, since the rules deny point reads of missing complaints.
      const legacy = await getDocsFromServer(query(collection(db, 'issues'),
        where('reportedBy', '==', userId), orderBy(documentId()), startAt(localId), limit(1)))
      assertCurrentSession()
      if (legacy.docs[0]?.id === localId) {
        transaction.set(receiptRef, { createdAt: serverTimestamp() })
        return
      }

      const complaintId = await allocateComplaintId(transaction)
      assertCurrentSession()
      transaction.set(issueRef, {
        complaintId,
        title: complaint.title,
        description: complaint.description,
        category: complaint.category,
        address: complaint.address,
        latitude: complaint.latitude ?? null,
        longitude: complaint.longitude ?? null,
        status: 'Pending',
        department: '',
        reportedBy: userId,
        imageUrl,
        photos,
        endorsedBy: [],
        endorsementCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      addComplaintEventToBatch(transaction, localId, {
        actorUid: userId,
        action: 'Complaint submitted',
        previousStatus: null,
        newStatus: 'Pending',
        remarks: complaint.description || 'Complaint submitted',
      })
      addNotificationToBatch(transaction, {
        recipientRole: 'admin',
        senderUid: userId,
        issueId: complaintId,
        type: 'new_complaint',
        title: 'New Complaint Submitted',
        message: 'A citizen has submitted a new complaint.',
      })
      transaction.set(receiptRef, { createdAt: serverTimestamp() })
    }).catch(async error => {
      if (error.code !== 'permission-denied') throw error
      // Rules can reject a losing concurrent commit as a receipt update before
      // the SDK retries. Confirm the winning upload before allowing cleanup.
      assertCurrentSession()
      const receipt = await getDocFromServer(receiptRef)
      assertCurrentSession()
      if (!receipt.exists()) throw error
    })
  })()
}
