const DB_NAME = 'civic-connect-offline'
const DB_VERSION = 1
const STORE_NAME = 'pending-complaints'

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not supported'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'localId',
        })

        store.createIndex('userId', 'userId', {
          unique: false,
        })

        store.createIndex('createdAt', 'createdAt', {
          unique: false,
        })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Normalize photo evidence from queue record to a valid File or Blob
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
      // Continue to fallback if File constructor fails
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

// Normalize audio evidence from queue record to a valid Blob
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
      // Continue to fallback if constructor fails
    }
  }

  if (!blob.type) {
    try {
      Object.defineProperty(blob, 'type', { value: type, configurable: true, writable: true })
    } catch {}
  }
  return blob
}

// Save a complaint for later submission.
export async function saveOfflineComplaint(complaint) {
  const db = await openDatabase()

  const photoFile = complaint.photoFile || null
  const photoName = photoFile?.name || complaint.photoName || null
  const photoType = photoFile?.type || complaint.photoType || null

  const audioBlob = complaint.audioBlob || complaint.audioFile || complaint.voiceNote?.blob || null
  const audioDuration = complaint.audioDuration ?? complaint.voiceNote?.durationSeconds ?? null
  const audioMimeType = audioBlob?.type || complaint.audioMimeType || complaint.audioContentType || complaint.voiceNote?.contentType || null

  const record = {
    ...complaint,
    photoFile,
    photoName,
    photoType,
    audioBlob,
    audioDuration,
    audioMimeType,
    localId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    syncStatus: 'pending',
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')

    transaction.objectStore(STORE_NAME).add(record)

    transaction.oncomplete = () => {
      db.close()
      resolve(record)
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

// Retrieve all pending complaints.
export async function getPendingComplaints(userId) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const now = Date.now()
      const complaints = request.result.filter(
        (complaint) => {
          const isPending = complaint.syncStatus === 'pending'
          // Auto-recover stale syncing complaints if sync timed out (e.g. tab closed mid-sync)
          const isStaleSyncing = complaint.syncStatus === 'syncing' &&
            (!complaint.syncAttemptAt || (now - new Date(complaint.syncAttemptAt).getTime() > 120000))
          return (isPending || isStaleSyncing) && (!userId || complaint.userId === userId)
        }
      )

      resolve(complaints)
      db.close()
    }

    request.onerror = () => {
      db.close()
      reject(request.error)
    }
  })
}

// Update the sync status of an offline complaint ('pending' | 'syncing')
export async function updateOfflineComplaintStatus(localId, syncStatus) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get ? store.get(localId) : null

    if (!request) {
      db.close()
      resolve(false)
      return
    }

    request.onsuccess = () => {
      const record = request.result
      if (!record) {
        resolve(false)
        return
      }
      record.syncStatus = syncStatus
      if (syncStatus === 'syncing') {
        record.syncAttemptAt = new Date().toISOString()
      }
      if (store.put) store.put(record)
    }

    transaction.oncomplete = () => {
      db.close()
      resolve(true)
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }

    transaction.onabort = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

export async function markComplaintSyncing(localId) {
  return await updateOfflineComplaintStatus(localId, 'syncing')
}

export async function markComplaintPending(localId) {
  return await updateOfflineComplaintStatus(localId, 'pending')
}

// Reset complaints stuck in 'syncing' beyond staleThresholdMs (e.g., if a previous tab crashed mid-sync)
export async function resetStaleSyncingComplaints(userId, staleThresholdMs = 120000) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()

    request.onsuccess = () => {
      const now = Date.now()
      const records = request.result || []
      let resetCount = 0

      for (const record of records) {
        if (
          record.syncStatus === 'syncing' &&
          (!userId || record.userId === userId)
        ) {
          const attemptTime = record.syncAttemptAt ? new Date(record.syncAttemptAt).getTime() : 0
          if (now - attemptTime > staleThresholdMs) {
            record.syncStatus = 'pending'
            if (store.put) store.put(record)
            resetCount++
          }
        }
      }
      resolve(resetCount)
    }

    transaction.oncomplete = () => {
      db.close()
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

// Remove a complaint only after successful synchronization.
export async function removeOfflineComplaint(localId) {
  const db = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')

    transaction.objectStore(STORE_NAME).delete(localId)

    transaction.oncomplete = () => {
      db.close()
      resolve(true)
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error)
    }
  })
}

// Count pending complaints.
export async function getPendingComplaintCount(userId) {
  const complaints = await getPendingComplaints(userId)
  return complaints.length
}