/**
 * Threaded Citizen-to-Officer Resolution Chat Channel Firebase Service
 * Manages encrypted real-time messages in subcollection `issues/{issueId}/messages`
 * and dispatches privacy-preserving notifications.
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore'
import { db } from './services'
import { encryptChatMessage, decryptChatMessage } from '@/utils/chatEncryption'
import { sanitizeText } from '@/utils/sanitize'

export const QUICK_ACTION_PROMPTS = {
  officer: [
    {
      id: 'landmark_request',
      label: 'Request Landmark',
      text: 'Can you specify a nearby landmark or distinguishing feature?',
    },
    {
      id: 'worker_onsite',
      label: 'Worker On-site',
      text: 'A municipal worker is currently on-site investigating the issue.',
    },
    {
      id: 'photo_request',
      label: 'Request Photo',
      text: 'Could you please upload an updated photo showing the current condition?',
    },
    {
      id: 'repair_scheduled',
      label: 'Work Scheduled',
      text: 'Repair work has been scheduled. Expected resolution within 24 hours.',
    },
    {
      id: 'inspection_dispatched',
      label: 'Inspection Active',
      text: 'Field inspection crew has been dispatched to your ward location.',
    },
  ],
  citizen: [
    {
      id: 'landmark_clarified',
      label: 'Landmark Provided',
      text: 'I have added landmark details near the main crossroad/building.',
    },
    {
      id: 'issue_worsened',
      label: 'Condition Worsened',
      text: 'The issue has worsened and requires urgent municipal attention.',
    },
    {
      id: 'worker_spotted',
      label: 'Worker Spotted',
      text: 'Municipal worker was seen on-site, thank you for the prompt action.',
    },
    {
      id: 'access_available',
      label: 'Available On-site',
      text: 'I am available on-site if the maintenance crew requires physical access.',
    },
  ],
}

/**
 * Sends a message in the resolution chat channel sub-collection.
 * Protects PII, encrypts content, and queues a privacy-safe in-app notification.
 */
export async function sendResolutionMessage({
  issueId,
  senderId,
  senderRole = 'citizen', // 'citizen' | 'officer' | 'admin'
  senderName = 'User',
  content,
  quickActionType = null,
  recipientUid = null,
  recipientRole = null,
  customDb = db,
}) {
  if (!issueId) throw new Error('issueId is required')
  if (!senderId) throw new Error('senderId is required')
  if (!content || !content.trim()) throw new Error('content is required')

  const cleanContent = sanitizeText(content.trim())
  const encryptedPayload = encryptChatMessage(cleanContent, issueId)

  const messagesRef = collection(customDb, 'issues', issueId, 'messages')
  const messageData = {
    senderId,
    senderRole,
    senderName: sanitizeText(senderName),
    content: encryptedPayload,
    quickActionType: quickActionType || null,
    readBy: [senderId],
    createdAt: serverTimestamp(),
  }

  const docRef = await addDoc(messagesRef, messageData)

  // Dispatch privacy-preserving in-app notification to the other party
  try {
    const determinedRecipientRole =
      recipientRole || (senderRole === 'citizen' ? 'admin' : 'citizen')
    const notifTitle =
      senderRole === 'citizen'
        ? 'New Citizen Resolution Message'
        : 'New Municipal Officer Message'

    const notificationsRef = collection(customDb, 'notifications')
    await addDoc(notificationsRef, {
      recipientUid: recipientUid || null,
      recipientRole: determinedRecipientRole,
      senderUid: senderId,
      issueId,
      type: 'resolution_chat',
      title: notifTitle,
      // Strictly generic message preview; phone numbers and emails are never exposed
      message: `New message regarding complaint #${issueId}.`,
      read: false,
      createdAt: serverTimestamp(),
    })
  } catch (notifErr) {
    // Non-fatal: do not block message sending if notification fails
    console.warn('[ResolutionChat] Notification dispatch non-fatal failure:', notifErr)
  }

  return { id: docRef.id, ...messageData, decryptedContent: cleanContent }
}

/**
 * Subscribes to real-time resolution chat messages for an issue.
 * Automatically decrypts message envelopes on delivery.
 */
export function subscribeToResolutionChat(
  issueId,
  onMessages,
  onError = null,
  customDb = db
) {
  if (!issueId) throw new Error('issueId is required to subscribe to chat')

  const messagesRef = collection(customDb, 'issues', issueId, 'messages')
  const q = query(messagesRef, orderBy('createdAt', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data()
        const decryptedContent = decryptChatMessage(data.content, issueId)
        return {
          id: docSnap.id,
          ...data,
          decryptedContent,
        }
      })
      if (typeof onMessages === 'function') {
        onMessages(messages)
      }
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(error)
      } else {
        console.error(`[ResolutionChat] Snapshot error for issue ${issueId}:`, error)
      }
    }
  )
}

/**
 * Marks messages as read by a specific user
 */
export async function markResolutionMessagesAsRead(
  issueId,
  messageIds = [],
  userId,
  customDb = db
) {
  if (!issueId || !userId || !messageIds.length) return

  try {
    const batch = writeBatch(customDb)
    messageIds.forEach((msgId) => {
      const msgRef = doc(customDb, 'issues', issueId, 'messages', msgId)
      batch.update(msgRef, {
        readBy: arrayUnion(userId),
      })
    })
    await batch.commit()
  } catch (err) {
    console.warn('[ResolutionChat] Failed to mark messages as read:', err)
  }
}
