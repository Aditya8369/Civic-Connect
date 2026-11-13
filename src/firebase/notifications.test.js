import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  createNotification,
  addNotificationToBatch,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getPushPermissionStatus,
  requestPushPermission,
  showNativeNotification,
  _resetMessagingInstanceForTests,
} from './notifications'

const firestoreState = vi.hoisted(() => ({
  docs: {},
  updates: [],
  adds: [],
}))

vi.mock('./services', () => ({
  default: { name: 'test-app' },
  db: {},
}))

vi.mock('./config', () => ({
  default: {
    apiKey: 'test-api-key',
    projectId: 'test-project',
    messagingSenderId: '123456789',
    appId: 'test-app-id',
  },
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => name,
  doc: (_db, ...parts) => parts.join('/'),
  addDoc: async (col, data) => {
    firestoreState.adds.push({ col, data })
    return { id: 'new-id' }
  },
  updateDoc: async (ref, data) => {
    firestoreState.updates.push({ ref, data })
    firestoreState.docs[ref] = { ...(firestoreState.docs[ref] || {}), ...data }
  },
  writeBatch: () => ({
    update: (ref, data) => {
      firestoreState.updates.push({ ref, data })
      firestoreState.docs[ref] = { ...(firestoreState.docs[ref] || {}), ...data }
    },
    commit: async () => {},
  }),
  serverTimestamp: () => 'mock-timestamp',
}))

const messagingMock = vi.hoisted(() => ({
  isSupported: vi.fn(),
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  onMessage: vi.fn(),
}))

vi.mock('firebase/messaging', () => ({
  isSupported: () => messagingMock.isSupported(),
  getMessaging: () => messagingMock.getMessaging(),
  getToken: (...args) => messagingMock.getToken(...args),
  onMessage: (...args) => messagingMock.onMessage(...args),
}))

describe('notifications service', () => {
  beforeEach(() => {
    firestoreState.docs = {}
    firestoreState.updates = []
    firestoreState.adds = []
    _resetMessagingInstanceForTests()
    messagingMock.isSupported.mockResolvedValue(true)
    messagingMock.getMessaging.mockReturnValue({ app: 'test-app' })
    messagingMock.getToken.mockResolvedValue('mock-fcm-token-xyz')

    vi.stubGlobal('window', {
      location: { pathname: '/', href: '/' },
      focus: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('createNotification & addNotificationToBatch', () => {
    it('creates notification document in firestore with default unread state and timestamp', async () => {
      await createNotification({
        recipientUid: 'user-456',
        recipientRole: 'citizen',
        senderUid: 'admin-123',
        issueId: 'CMP-2026-0001',
        type: 'department_assigned',
        title: 'Department Assigned',
        message: 'Assigned to Roads department',
      })

      expect(firestoreState.adds).toHaveLength(1)
      expect(firestoreState.adds[0].col).toBe('notifications')
      expect(firestoreState.adds[0].data).toEqual({
        recipientUid: 'user-456',
        recipientRole: 'citizen',
        senderUid: 'admin-123',
        issueId: 'CMP-2026-0001',
        type: 'department_assigned',
        title: 'Department Assigned',
        message: 'Assigned to Roads department',
        read: false,
        createdAt: 'mock-timestamp',
      })
    })

    it('queues notification write on batch', () => {
      const batchWrites = []
      const fakeBatch = {
        set: (ref, data) => batchWrites.push({ ref, data }),
      }

      addNotificationToBatch(fakeBatch, {
        recipientUid: 'citizen-1',
        recipientRole: 'citizen',
        senderUid: 'admin-1',
        issueId: 'CMP-100',
        type: 'status_update',
        title: 'Status Updated',
        message: 'In Progress',
      })

      expect(batchWrites).toHaveLength(1)
      expect(batchWrites[0].data.read).toBe(false)
      expect(batchWrites[0].data.issueId).toBe('CMP-100')
    })

    it('marks a single notification as read or unread', async () => {
      await markNotificationAsRead('notif-123', true)
      expect(firestoreState.updates).toContainEqual({
        ref: 'notifications/notif-123',
        data: { read: true },
      })

      await markNotificationAsRead('notif-123', false)
      expect(firestoreState.updates).toContainEqual({
        ref: 'notifications/notif-123',
        data: { read: false },
      })
    })

    it('marks all notification IDs as read using batch update', async () => {
      await markAllNotificationsAsRead(['notif-1', 'notif-2'])
      expect(firestoreState.updates).toContainEqual({
        ref: 'notifications/notif-1',
        data: { read: true },
      })
      expect(firestoreState.updates).toContainEqual({
        ref: 'notifications/notif-2',
        data: { read: true },
      })
    })

    it('handles empty or missing IDs safely in markAllNotificationsAsRead', async () => {
      const prevLength = firestoreState.updates.length
      await markAllNotificationsAsRead([])
      await markAllNotificationsAsRead(null)
      expect(firestoreState.updates).toHaveLength(prevLength)
    })
  })

  describe('getPushPermissionStatus', () => {
    it('returns "unsupported" when Notification API does not exist', () => {
      expect(getPushPermissionStatus()).toBe('unsupported')
    })

    it('reflects current permission value (default, granted, denied)', () => {
      vi.stubGlobal('Notification', { permission: 'granted' })
      expect(getPushPermissionStatus()).toBe('granted')

      vi.stubGlobal('Notification', { permission: 'denied' })
      expect(getPushPermissionStatus()).toBe('denied')

      vi.stubGlobal('Notification', { permission: 'default' })
      expect(getPushPermissionStatus()).toBe('default')
    })
  })

  describe('requestPushPermission', () => {
    it('returns denied gracefully when permission is initially denied without prompting or writing', async () => {
      vi.stubGlobal('Notification', {
        permission: 'denied',
        requestPermission: vi.fn(),
      })

      const result = await requestPushPermission('citizen-user-1')

      expect(result).toEqual({ status: 'denied' })
      expect(globalThis.Notification.requestPermission).not.toHaveBeenCalled()
      expect(firestoreState.updates).toHaveLength(0)
    })

    it('requests permission if default and handles citizen declining without throwing', async () => {
      vi.stubGlobal('Notification', {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('denied'),
      })

      const result = await requestPushPermission('citizen-user-1')

      expect(result).toEqual({ status: 'denied' })
      expect(globalThis.Notification.requestPermission).toHaveBeenCalled()
      expect(firestoreState.updates).toHaveLength(0)
    })

    it('registers service worker, gets FCM token, and saves to users doc when granted', async () => {
      const registerMock = vi.fn().mockResolvedValue({ scope: '/' })
      Object.defineProperty(globalThis.navigator, 'serviceWorker', {
        value: { register: registerMock },
        configurable: true,
      })

      vi.stubGlobal('Notification', {
        permission: 'default',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      })

      const result = await requestPushPermission('citizen-user-1')

      expect(result.status).toBe('granted')
      expect(result.token).toBe('mock-fcm-token-xyz')
      expect(registerMock).toHaveBeenCalled()
      expect(registerMock.mock.calls[0][0]).toContain('/firebase-messaging-sw.js')

      expect(firestoreState.updates).toHaveLength(1)
      expect(firestoreState.updates[0].ref).toBe('users/citizen-user-1')
      expect(firestoreState.updates[0].data).toEqual({
        fcmToken: 'mock-fcm-token-xyz',
        pushNotificationsEnabled: true,
        updatedAt: 'mock-timestamp',
      })
    })

    it('returns unsupported if firebase messaging is not supported in the environment', async () => {
      messagingMock.isSupported.mockResolvedValue(false)
      vi.stubGlobal('Notification', {
        permission: 'granted',
        requestPermission: vi.fn().mockResolvedValue('granted'),
      })

      const result = await requestPushPermission('citizen-user-1')
      expect(result).toEqual({ status: 'unsupported' })
    })

    it('fails gracefully when getToken throws an error', async () => {
      messagingMock.getToken.mockRejectedValue(new Error('Network error during registration'))
      vi.stubGlobal('Notification', {
        permission: 'granted',
      })

      const result = await requestPushPermission('citizen-user-1')
      expect(result.status).toBe('error')
      expect(result.error).toBeDefined()
    })
  })

  describe('showNativeNotification and deep linking', () => {
    it('does not display native notification when permission is not granted', () => {
      vi.stubGlobal('Notification', { permission: 'denied' })
      const res = showNativeNotification({ title: 'Test', message: 'Hello' })
      expect(res).toBeNull()
    })

    it('displays native notification with deep-link URL pointing to /complaints/:id when granted', () => {
      let createdNotification = null
      class MockNotification {
        constructor(title, options) {
          this.title = title
          this.options = options
          this.close = vi.fn()
          createdNotification = this
        }
      }
      MockNotification.permission = 'granted'
      vi.stubGlobal('Notification', MockNotification)

      const notif = showNativeNotification({
        title: 'Complaint Status Updated',
        message: 'Your complaint is now In Progress',
        issueId: 'CMP-2026-999',
      })

      expect(notif).toBeDefined()
      expect(createdNotification.title).toBe('Complaint Status Updated')
      expect(createdNotification.options.body).toBe('Your complaint is now In Progress')
      expect(createdNotification.options.data.url).toBe('/complaints/CMP-2026-999')
    })
  })
})
