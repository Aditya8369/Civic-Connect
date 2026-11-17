import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './services'

export const BROADCASTS_COLLECTION = 'broadcasts'
export const BROADCAST_TITLE_MAX_LENGTH = 120
export const BROADCAST_MESSAGE_MAX_LENGTH = 600

export const BROADCAST_SEVERITIES = Object.freeze([
  {
    value: 'info',
    label: 'Information',
    description: 'Routine citywide notice',
  },
  {
    value: 'warning',
    label: 'Advisory',
    description: 'Disruption or service interruption',
  },
  {
    value: 'critical',
    label: 'Critical emergency',
    description: 'Immediate danger to residents',
  },
])

export const DEFAULT_BROADCAST_SEVERITY = 'warning'

const SEVERITY_VALUES = BROADCAST_SEVERITIES.map(({ value }) => value)

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

export function isBroadcastSeverity(value) {
  return SEVERITY_VALUES.includes(value)
}

export function normalizeBroadcastSeverity(value) {
  return isBroadcastSeverity(value) ? value : DEFAULT_BROADCAST_SEVERITY
}

/**
 * Turns composer input or a stored Firestore document into a predictable
 * broadcast shape. Returns null when the required title or message is missing.
 */
export function normalizeEmergencyBroadcast(input) {
  if (!input || typeof input !== 'object') return null

  const title = cleanText(input.title, BROADCAST_TITLE_MAX_LENGTH)
  const message = cleanText(input.message, BROADCAST_MESSAGE_MAX_LENGTH)

  if (!title || !message) return null

  return {
    title,
    message,
    severity: normalizeBroadcastSeverity(input.severity),
    active: typeof input.active === 'boolean' ? input.active : true,
  }
}

export function getBroadcastCreatedAtMillis(broadcast) {
  const value = broadcast?.createdAt
  if (!value) return 0

  if (typeof value.toMillis === 'function') {
    return value.toMillis()
  }

  if (value instanceof Date) {
    return value.getTime()
  }

  if (typeof value === 'number') {
    return value
  }

  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function isEmergencyBroadcastActive(broadcast) {
  return Boolean(
    broadcast &&
      broadcast.active !== false &&
      typeof broadcast.title === 'string' &&
      broadcast.title.trim() &&
      typeof broadcast.message === 'string' &&
      broadcast.message.trim()
  )
}

function mapBroadcastDocument(docSnapshot) {
  const data = docSnapshot.data() || {}
  const normalized = normalizeEmergencyBroadcast(data)

  if (!normalized) return null

  return {
    id: docSnapshot.id,
    ...normalized,
    createdAt: data.createdAt ?? null,
    createdBy: data.createdBy ?? null,
  }
}

/**
 * Subscribes to the active citywide broadcasts and reports the newest one.
 * The callback always receives a broadcast object or null, never a list.
 */
export function listenToActiveEmergencyBroadcast(
  onChange,
  { onError, firestore = db } = {}
) {
  if (typeof onChange !== 'function') return () => {}

  const broadcastsQuery = query(
    collection(firestore, BROADCASTS_COLLECTION),
    where('active', '==', true)
  )

  return onSnapshot(
    broadcastsQuery,
    (snapshot) => {
      const broadcasts = snapshot.docs
        .map(mapBroadcastDocument)
        .filter(Boolean)
        .filter(isEmergencyBroadcastActive)
        .sort(
          (a, b) =>
            getBroadcastCreatedAtMillis(b) - getBroadcastCreatedAtMillis(a)
        )

      onChange(broadcasts[0] || null)
    },
    (error) => {
      if (typeof onError === 'function') onError(error)
    }
  )
}

/**
 * Publishes a new active broadcast. Any previously active broadcast is
 * deactivated in the same batch so citizens always see exactly one alert.
 */
export async function publishEmergencyBroadcast(
  input,
  { actorUid = null, firestore = db } = {}
) {
  const broadcast = normalizeEmergencyBroadcast({ ...input, active: true })

  if (!broadcast) {
    throw new Error('A broadcast title and message are required')
  }

  const activeQuery = query(
    collection(firestore, BROADCASTS_COLLECTION),
    where('active', '==', true)
  )
  const activeSnapshot = await getDocs(activeQuery)

  const batch = writeBatch(firestore)

  activeSnapshot.docs.forEach((activeDoc) => {
    batch.update(activeDoc.ref, {
      active: false,
      deactivatedAt: serverTimestamp(),
      ...(actorUid ? { deactivatedBy: actorUid } : {}),
    })
  })

  const broadcastRef = doc(collection(firestore, BROADCASTS_COLLECTION))

  batch.set(broadcastRef, {
    ...broadcast,
    createdAt: serverTimestamp(),
    ...(actorUid ? { createdBy: actorUid } : {}),
  })

  await batch.commit()

  return broadcastRef.id
}

export async function deactivateEmergencyBroadcast(
  broadcastId,
  { actorUid = null, firestore = db } = {}
) {
  if (!broadcastId) return

  await updateDoc(doc(firestore, BROADCASTS_COLLECTION, broadcastId), {
    active: false,
    deactivatedAt: serverTimestamp(),
    ...(actorUid ? { deactivatedBy: actorUid } : {}),
  })
}
