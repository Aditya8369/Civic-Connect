
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './services'

export const DEFAULT_NOTIFICATION_PREFERENCES = {
  sound: true,
  push: false,
  emailDigest: true,
}

function getStorageKey(uid) {
  return `civic-connect-notification-preferences-${uid}`
}

function normalizePreferences(preferences = {}) {
  return {
    sound:
      typeof preferences.sound === 'boolean'
        ? preferences.sound
        : DEFAULT_NOTIFICATION_PREFERENCES.sound,
    push:
      typeof preferences.push === 'boolean'
        ? preferences.push
        : DEFAULT_NOTIFICATION_PREFERENCES.push,
    emailDigest:
      typeof preferences.emailDigest === 'boolean'
        ? preferences.emailDigest
        : DEFAULT_NOTIFICATION_PREFERENCES.emailDigest,
  }
}

function readLocalPreferences(uid) {
  try {
    const saved = localStorage.getItem(getStorageKey(uid))
    return saved ? normalizePreferences(JSON.parse(saved)) : null
  } catch (error) {
    console.warn('Could not read local notification preferences:', error)
    return null
  }
}

function saveLocalPreferences(uid, preferences) {
  try {
    localStorage.setItem(
      getStorageKey(uid),
      JSON.stringify(preferences)
    )
  } catch (error) {
    console.warn('Could not save notification preferences locally:', error)
  }
}

export async function loadNotificationPreferences(uid) {
  if (!uid) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }

  try {
    const snapshot = await getDoc(doc(db, 'users', uid))

    if (snapshot.exists()) {
      const saved = snapshot.data().notificationPreferences

      if (saved) {
        const preferences = normalizePreferences(saved)
        saveLocalPreferences(uid, preferences)
        return preferences
      }
    }
  } catch (error) {
    console.warn(
      'Could not load notification preferences from Firestore:',
      error
    )
  }

  return (
    readLocalPreferences(uid) || {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
    }
  )
}

export async function saveNotificationPreferences(uid, updates) {
  if (!uid) {
    throw new Error('A signed-in user is required')
  }

  const current = await loadNotificationPreferences(uid)

  const preferences = normalizePreferences({
    ...current,
    ...updates,
  })

  // Save locally first so preferences survive Firestore failures.
  saveLocalPreferences(uid, preferences)

  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        notificationPreferences: preferences,
        ...(typeof updates.push === 'boolean'
          ? { pushNotificationsEnabled: updates.push }
          : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  } catch (error) {
    console.warn(
      'Could not save notification preferences to Firestore:',
      error
    )
    // Local preferences remain available as a fallback.
  }

  return preferences
}
