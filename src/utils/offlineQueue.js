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

// Save a complaint for later submission.
export async function saveOfflineComplaint(complaint) {
  const db = await openDatabase()

  const photoFile = complaint.photoFile || null
  const photoName = photoFile?.name || complaint.photoName || null
  const photoType = photoFile?.type || complaint.photoType || null

  const record = {
    ...complaint,
    photoFile,
    photoName,
    photoType,
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
      const complaints = request.result.filter(
        (complaint) =>
          complaint.syncStatus === 'pending' &&
          (!userId || complaint.userId === userId)
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