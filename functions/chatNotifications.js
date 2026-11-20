/**
 * Cloud Function Trigger for Threaded Citizen-to-Officer Resolution Chat Channel
 * Dispatches real-time web push & badge notifications while keeping phone numbers and emails completely private.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g

/**
 * Sanitizes notification text to guarantee zero PII exposure
 */
export function sanitizePrivacyText(text) {
  if (!text || typeof text !== 'string') return ''
  return text
    .replace(EMAIL_REGEX, '[REDACTED_EMAIL]')
    .replace(PHONE_REGEX, (match) => {
      const digits = match.replace(/\D/g, '')
      return digits.length >= 7 ? '[REDACTED_PHONE]' : match
    })
    .trim()
}

/**
 * Pure handler for message creation in issues/{issueId}/messages/{messageId}
 */
export async function handleResolutionChatMessage(snapshot, context = {}, options = {}) {
  try {
    const data = snapshot && typeof snapshot.data === 'function' ? snapshot.data() : null
    if (!data) return { dispatched: false, reason: 'no_data' }

    const issueId = context.params?.issueId || data.issueId
    if (!issueId) return { dispatched: false, reason: 'no_issue_id' }

    const senderRole = data.senderRole || 'citizen'
    const senderId = data.senderId

    const app = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
    const firestore = options.firestore || getFirestore(app)

    // Lookup issue to resolve the other party
    let recipientUid = data.recipientUid || null
    let complaintTitle = ''
    try {
      const issueDoc = await firestore.collection('issues').doc(issueId).get()
      if (issueDoc.exists) {
        const issueData = issueDoc.data() || {}
        complaintTitle = issueData.title || ''
        if (!recipientUid) {
          recipientUid =
            senderRole === 'citizen'
              ? issueData.assignedOfficerId || null
              : issueData.reportedBy || null
        }
      }
    } catch (err) {
      console.warn('[ChatNotifications] Could not fetch parent issue:', err.message)
    }

    const title =
      senderRole === 'citizen'
        ? 'Citizen Message Received'
        : 'Municipal Officer Message'

    // Generic body preserving complete privacy (no phone numbers or email addresses)
    const body = sanitizePrivacyText(
      `New resolution update regarding complaint #${issueId}.`
    )

    const notificationPayload = {
      recipientUid,
      recipientRole: senderRole === 'citizen' ? 'admin' : 'citizen',
      senderUid: senderId,
      issueId,
      type: 'resolution_chat',
      title,
      message: body,
      read: false,
      createdAt: new Date(),
    }

    // Save in-app notification in notifications collection
    if (firestore) {
      await firestore.collection('notifications').add(notificationPayload)
    }

    // Dispatch Web Push notification via FCM if messaging instance or token is provided
    let pushDispatched = false
    if (options.messaging) {
      try {
        await options.messaging.send({
          topic: `issue_${issueId}`,
          notification: { title, body },
          data: {
            issueId,
            type: 'resolution_chat',
            messageId: context.params?.messageId || '',
          },
        })
        pushDispatched = true
      } catch (pushErr) {
        console.warn('[ChatNotifications] Web Push notification skipped or failed:', pushErr.message)
      }
    }

    return {
      dispatched: true,
      recipientUid,
      pushDispatched,
      title,
      body,
    }
  } catch (err) {
    console.error('[ChatNotifications] Failed to process message notification:', err)
    return { dispatched: false, error: err.message }
  }
}

/**
 * Cloud Function Trigger on new message document
 */
export const onResolutionMessageCreated = onDocumentCreated(
  'issues/{issueId}/messages/{messageId}',
  async (event) => {
    const app = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
    const firestore = getFirestore(app)
    let messaging = null
    try {
      messaging = getMessaging(app)
    } catch {
      // Messaging might not be configured in mock/emulator environments
    }

    return handleResolutionChatMessage(event.data, event, {
      firestore,
      messaging,
    })
  }
)
