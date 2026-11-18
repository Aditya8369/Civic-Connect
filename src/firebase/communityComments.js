import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './services'
import { sanitizeMarkdown, sanitizeText } from '@/utils/sanitize'

/**
 * Subscribes to real-time comments for a specific issue.
 * Safely registers both data and error callbacks, returning an unsubscribe handle.
 */
export function subscribeToIssueComments(
  issueId,
  onComments,
  onError = null,
  customDb = db
) {
  if (!issueId) {
    throw new Error('issueId is required to subscribe to comments')
  }

  const commentsRef = collection(customDb, 'issues', issueId, 'comments')
  const q = query(commentsRef, orderBy('createdAt', 'asc'))

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }))
      if (typeof onComments === 'function') {
        onComments(list)
      }
    },
    (error) => {
      if (typeof onError === 'function') {
        onError(error)
      } else {
        console.error(`Firestore error on comments query for issue ${issueId}:`, error)
      }
    }
  )
}

/**
 * Creates an in-memory manager for real-time comment listeners.
 * Tracks active subscriptions and guarantees clean teardown on toggle or unmount.
 */
export function createCommentSubscriptionManager(customDb = db) {
  const listeners = new Map()

  return {
    /**
     * Subscribes to comments for issueId if not already actively subscribed.
     * Returns true if a new subscription was initiated, false if already active.
     */
    subscribe(issueId, onComments, onError) {
      if (!issueId) return false
      if (listeners.has(issueId)) return false

      const unsub = subscribeToIssueComments(issueId, onComments, onError, customDb)
      listeners.set(issueId, unsub)
      return true
    },

    /**
     * Unsubscribes from issueId comments and frees the listener.
     * Returns true if a listener was found and closed, false otherwise.
     */
    unsubscribe(issueId) {
      if (!issueId) return false
      const unsub = listeners.get(issueId)
      if (unsub) {
        try {
          unsub()
        } catch (err) {
          console.error(`Failed to unsubscribe comments for issue ${issueId}:`, err)
        }
        listeners.delete(issueId)
        return true
      }
      return false
    },

    /**
     * Unsubscribes all active comment listeners.
     * Essential for component unmount cleanup to avoid memory leaks.
     */
    unsubscribeAll() {
      listeners.forEach((unsub, id) => {
        try {
          unsub()
        } catch (err) {
          console.error(`Failed to unsubscribe comments for issue ${id}:`, err)
        }
      })
      listeners.clear()
    },

    /**
     * Checks whether an issue currently has an active listener.
     */
    has(issueId) {
      return listeners.has(issueId)
    },

    /**
     * Returns the count of active subscriptions.
     */
    get size() {
      return listeners.size
    },

    /**
     * Returns a snapshot array of all active issue IDs.
     */
    getActiveIssueIds() {
      return Array.from(listeners.keys())
    },
  }
}

/**
 * Posts a new comment to an issue's comments subcollection.
 */
export async function postIssueComment({
  issueId,
  text,
  authorName = 'Citizen',
  authorId,
  customDb = db,
}) {
  if (!issueId) {
    throw new Error('issueId is required to post a comment')
  }
  const trimmed = (text || '').trim()
  if (!trimmed) {
    throw new Error('Comment text cannot be empty')
  }
  const cleanText = sanitizeMarkdown(trimmed)
  if (!cleanText) {
    throw new Error('Comment text cannot be empty')
  }
  if (!authorId) {
    throw new Error('authorId is required to post a comment')
  }

  const cleanAuthorName = sanitizeText(authorName) || 'Citizen'

  const commentsRef = collection(customDb, 'issues', issueId, 'comments')
  return addDoc(commentsRef, {
    text: cleanText,
    authorName: cleanAuthorName,
    authorId,
    createdAt: serverTimestamp(),
  })
}
