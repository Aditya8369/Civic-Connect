// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  sendResolutionMessage,
  subscribeToResolutionChat,
  markResolutionMessagesAsRead,
  QUICK_ACTION_PROMPTS,
} from './resolutionChat'

const runtime = vi.hoisted(() => ({
  activeListeners: new Map(),
  addedDocs: [],
  updatedDocs: [],
  batchUpdates: [],
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  return {
    collection: (_db, ...paths) => paths.join('/'),
    doc: (_db, ...paths) => paths.join('/'),
    query: (ref, ..._ops) => ({ path: ref }),
    orderBy: (field, dir) => ({ field, dir }),
    serverTimestamp: () => 'MOCK_SERVER_TIMESTAMP',
    arrayUnion: (val) => ({ _type: 'arrayUnion', val }),
    addDoc: async (ref, data) => {
      runtime.addedDocs.push({ ref, data })
      return { id: `msg-${runtime.addedDocs.length}` }
    },
    updateDoc: async (ref, data) => {
      runtime.updatedDocs.push({ ref, data })
    },
    writeBatch: () => ({
      update: (ref, data) => {
        runtime.batchUpdates.push({ ref, data })
      },
      commit: async () => {},
    }),
    onSnapshot: (queryObj, onNext, onError) => {
      const unsub = vi.fn(() => {
        runtime.activeListeners.delete(queryObj.path)
      })
      runtime.activeListeners.set(queryObj.path, { onNext, onError, unsub })
      return unsub
    },
  }
})

describe('resolutionChat Firebase Service', () => {
  beforeEach(() => {
    runtime.activeListeners.clear()
    runtime.addedDocs = []
    runtime.updatedDocs = []
    runtime.batchUpdates = []
    vi.clearAllMocks()
  })

  describe('QUICK_ACTION_PROMPTS', () => {
    it('provides standard prompts for officers and citizens', () => {
      expect(Array.isArray(QUICK_ACTION_PROMPTS.officer)).toBe(true)
      expect(Array.isArray(QUICK_ACTION_PROMPTS.citizen)).toBe(true)

      const landmark = QUICK_ACTION_PROMPTS.officer.find((p) => p.id === 'landmark_request')
      expect(landmark).toBeDefined()
      expect(landmark.text).toContain('landmark')

      const onsite = QUICK_ACTION_PROMPTS.officer.find((p) => p.id === 'worker_onsite')
      expect(onsite).toBeDefined()
      expect(onsite.text).toContain('on-site')
    })
  })

  describe('sendResolutionMessage', () => {
    it('throws when required fields are missing', async () => {
      await expect(sendResolutionMessage({})).rejects.toThrow('issueId is required')
      await expect(sendResolutionMessage({ issueId: 'iss-1' })).rejects.toThrow('senderId is required')
      await expect(sendResolutionMessage({ issueId: 'iss-1', senderId: 'u-1', content: '' })).rejects.toThrow(
        'content is required'
      )
    })

    it('encrypts message and writes to issues/{issueId}/messages and dispatches privacy-safe notification', async () => {
      const result = await sendResolutionMessage({
        issueId: 'CMP-2026-1001',
        senderId: 'officer-99',
        senderRole: 'officer',
        senderName: 'Officer Rao',
        content: 'Worker is on-site at main junction. Call 9876543210 if needed.',
        quickActionType: 'worker_onsite',
        recipientUid: 'citizen-42',
      })

      expect(result.id).toBeDefined()
      expect(runtime.addedDocs.length).toBe(2)

      // 1st doc: message in subcollection
      const messageDoc = runtime.addedDocs[0]
      expect(messageDoc.ref).toBe('issues/CMP-2026-1001/messages')
      expect(messageDoc.data.senderId).toBe('officer-99')
      expect(messageDoc.data.senderRole).toBe('officer')
      expect(messageDoc.data.senderName).toBe('Officer Rao')
      expect(messageDoc.data.content.encrypted).toBe(true)
      expect(messageDoc.data.quickActionType).toBe('worker_onsite')

      // 2nd doc: notification
      const notifDoc = runtime.addedDocs[1]
      expect(notifDoc.ref).toBe('notifications')
      expect(notifDoc.data.recipientUid).toBe('citizen-42')
      expect(notifDoc.data.recipientRole).toBe('citizen')
      expect(notifDoc.data.issueId).toBe('CMP-2026-1001')
      // Ensure phone number was never included in the notification text
      expect(notifDoc.data.message).not.toContain('9876543210')
      expect(notifDoc.data.message).toContain('CMP-2026-1001')
    })
  })

  describe('subscribeToResolutionChat', () => {
    it('throws error when issueId is missing', () => {
      expect(() => subscribeToResolutionChat('')).toThrow('issueId is required')
    })

    it('subscribes and decrypts messages automatically on snapshot emission', () => {
      const onMessages = vi.fn()
      const unsub = subscribeToResolutionChat('CMP-2026-1002', onMessages)
      expect(runtime.activeListeners.has('issues/CMP-2026-1002/messages')).toBe(true)

      const entry = runtime.activeListeners.get('issues/CMP-2026-1002/messages')
      entry.onNext({
        docs: [
          {
            id: 'm1',
            data: () => ({
              senderId: 'citizen-1',
              senderRole: 'citizen',
              content: 'Can someone inspect the pothole?',
              createdAt: '2026-11-20T10:00:00Z',
            }),
          },
        ],
      })

      expect(onMessages).toHaveBeenCalledTimes(1)
      const emittedList = onMessages.mock.calls[0][0]
      expect(emittedList.length).toBe(1)
      expect(emittedList[0].id).toBe('m1')
      expect(emittedList[0].decryptedContent).toBe('Can someone inspect the pothole?')

      unsub()
      expect(runtime.activeListeners.has('issues/CMP-2026-1002/messages')).toBe(false)
    })
  })

  describe('markResolutionMessagesAsRead', () => {
    it('updates readBy via batch update', async () => {
      await markResolutionMessagesAsRead('CMP-2026-1003', ['m1', 'm2'], 'user-1')
      expect(runtime.batchUpdates.length).toBe(2)
      expect(runtime.batchUpdates[0].ref).toBe('issues/CMP-2026-1003/messages/m1')
      expect(runtime.batchUpdates[0].data.readBy.val).toBe('user-1')
    })
  })
})
