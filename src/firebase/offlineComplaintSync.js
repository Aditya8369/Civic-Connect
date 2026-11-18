import {
  collection, doc, documentId, getDocFromServer, getDocsFromServer, limit, orderBy, query,
  runTransaction, serverTimestamp, startAt, where,
} from 'firebase/firestore'
import { auth, db } from './services'
import { allocateComplaintId } from './complaintId'
import { addComplaintEventToBatch } from './complaintEvents'
import { addNotificationToBatch } from './notifications'
import { uploadComplaintPhoto, uploadComplaintAudio, deleteComplaintEvidence } from './storage'
import { sanitizeText, sanitizeMarkdown } from '@/utils/sanitize'

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

export function normalizeAudioBlob(complaint) {
  const audio = complaint?.audioBlob || complaint?.audioFile || complaint?.voiceNote?.blob
  if (!audio) return null

  const type = audio.type || complaint?.audioMimeType || complaint?.audioContentType || 'audio/webm'
  const blob = audio.blob || audio

  if (typeof Blob !== 'undefined') {
    if (blob instanceof Blob && blob.type === type) {
      return blob
    }
    try {
      return new Blob([blob], { type })
    } catch {
      // Continue to fallback
    }
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
  const uploadAudio = options.uploadAudio || uploadComplaintAudio
  const deleteEvidence = options.deleteEvidence || deleteComplaintEvidence

  function assertCurrentSession() {
    if (!session || session.uid !== userId || auth.currentUser !== session) {
      throw new Error('Your sign-in session changed before the complaint could sync')
    }
  }

  assertCurrentSession()

  return (async () => {
    const uploadedArtifacts = []
    let photoUpload = null
    let audioUpload = null

    try {
      const photoFile = normalizePhotoFile(complaint)
      if (photoFile) {
        photoUpload = await uploadPhoto(photoFile, localId)
        if (photoUpload?.path) {
          uploadedArtifacts.push(photoUpload.path)
        }
      }

      assertCurrentSession()

      const audioBlob = normalizeAudioBlob(complaint)
      if (audioBlob) {
        const duration = complaint.audioDuration ?? complaint.voiceNote?.durationSeconds ?? 0
        audioUpload = await uploadAudio(audioBlob, localId, duration)
        if (audioUpload?.path) {
          uploadedArtifacts.push(audioUpload.path)
        }
      }

      assertCurrentSession()
    } catch (uploadError) {
      if (uploadedArtifacts.length > 0) {
        try {
          await deleteEvidence(uploadedArtifacts)
        } catch (cleanupErr) {
          console.warn('Failed to clean up uploaded evidence after upload failure:', cleanupErr)
        }
      }
      throw uploadError
    }

    const imageUrl = photoUpload?.downloadUrl || null
    const photos = photoUpload ? [photoUpload] : []
    const audioNote = audioUpload
      ? {
          url: audioUpload.downloadUrl,
          path: audioUpload.path,
          filename: audioUpload.filename,
          durationSeconds: audioUpload.durationSeconds,
          contentType: audioUpload.contentType,
        }
      : null

    let transactionSucceeded = false
    try {
      const result = await runTransaction(db, async transaction => {
        assertCurrentSession()
        const receipt = await transaction.get(receiptRef)
        assertCurrentSession()
        if (receipt.exists()) {
          transactionSucceeded = true
          return
        }

        // Older uploads have no receipt. Check the first owned document at or
        // after this ID, since the rules deny point reads of missing complaints.
        const legacy = await getDocsFromServer(query(collection(db, 'issues'),
          where('reportedBy', '==', userId), orderBy(documentId()), startAt(localId), limit(1)))
        assertCurrentSession()
        if (legacy.docs[0]?.id === localId) {
          transaction.set(receiptRef, { createdAt: serverTimestamp() })
          transactionSucceeded = true
          return
        }

        const complaintId = await allocateComplaintId(transaction)
        assertCurrentSession()
        transaction.set(issueRef, {
          complaintId,
          title: sanitizeText(complaint.title),
          description: sanitizeMarkdown(complaint.description),
          category: complaint.category,
          address: sanitizeText(complaint.address),
          latitude: complaint.latitude ?? null,
          longitude: complaint.longitude ?? null,
          status: 'Pending',
          department: '',
          reportedBy: userId,
          imageUrl,
          photos,
          audioNote,
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
      })
      transactionSucceeded = true
      return result
    } catch (error) {
      if (error.code === 'permission-denied') {
        // Rules can reject a losing concurrent commit as a receipt update before
        // the SDK retries. Confirm the winning upload before allowing cleanup.
        assertCurrentSession()
        const receipt = await getDocFromServer(receiptRef)
        assertCurrentSession()
        if (receipt.exists()) {
          transactionSucceeded = true
          return
        }
      }
      throw error
    } finally {
      if (!transactionSucceeded && uploadedArtifacts.length > 0) {
        try {
          await deleteEvidence(uploadedArtifacts)
        } catch (cleanupErr) {
          console.warn('Failed to clean up uploaded evidence after transaction failure:', cleanupErr)
        }
      }
    }
  })()
}
