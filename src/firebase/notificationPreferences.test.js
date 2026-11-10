
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './services'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
} from './notificationPreferences'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
}))

vi.mock('./services', () => ({
  db: {},
}))

describe('notification preferences', () => {
  const uid = 'test-user-123'
  const storageKey = `civic-connect-notification-preferences-${uid}`

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    doc.mockReturnValue('user-document')
    serverTimestamp.mockReturnValue('SERVER_TIMESTAMP')
  })

  it('returns default preferences when no user is signed in', async () => {
    const result = await loadNotificationPreferences(null)

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(getDoc).not.toHaveBeenCalled()
  })

  it('loads saved preferences from Firestore', async () => {
    const savedPreferences = {
      sound: false,
      push: true,
      emailDigest: false,
    }

    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        notificationPreferences: savedPreferences,
      }),
    })

    const result = await loadNotificationPreferences(uid)

    expect(doc).toHaveBeenCalledWith(db, 'users', uid)
    expect(result).toEqual(savedPreferences)
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(savedPreferences)
  })

  it('uses defaults when Firestore has no saved preferences', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({}),
    })

    const result = await loadNotificationPreferences(uid)

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  })

  it('uses localStorage when Firestore cannot be reached', async () => {
    const localPreferences = {
      sound: false,
      push: true,
      emailDigest: false,
    }

    localStorage.setItem(storageKey, JSON.stringify(localPreferences))
    getDoc.mockRejectedValue(new Error('Network unavailable'))

    const result = await loadNotificationPreferences(uid)

    expect(result).toEqual(localPreferences)
  })

  it('fills in missing preference values with defaults', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        notificationPreferences: { sound: false },
      }),
    })

    const result = await loadNotificationPreferences(uid)

    expect(result).toEqual({
      sound: false,
      push: false,
      emailDigest: true,
    })
  })

  it('saves updated preferences to Firestore and localStorage', async () => {
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      }),
    })
    setDoc.mockResolvedValue(undefined)

    const result = await saveNotificationPreferences(uid, {
      sound: false,
    })

    const expected = {
      sound: false,
      push: false,
      emailDigest: true,
    }

    expect(result).toEqual(expected)
    expect(setDoc).toHaveBeenCalledWith(
      'user-document',
      {
        notificationPreferences: expected,
        updatedAt: 'SERVER_TIMESTAMP',
      },
      { merge: true }
    )
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(expected)
  })

  it('keeps local preferences when the Firestore save fails', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    })
    setDoc.mockRejectedValue(new Error('Network unavailable'))

    const result = await saveNotificationPreferences(uid, {
      sound: false,
    })

    expect(result.sound).toBe(false)
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual(result)
  })

  it('rejects saving when no user is signed in', async () => {
    await expect(
      saveNotificationPreferences(null, { sound: false })
    ).rejects.toThrow('A signed-in user is required')
  })
})
