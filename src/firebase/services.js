import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import firebaseConfig from './config'

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

// Fail fast on network/configuration errors (10s instead of default 2min retry loop)
storage.maxUploadRetryTime = 10000
storage.maxOperationRetryTime = 10000

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099')
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectStorageEmulator(storage, 'localhost', 9199)
}

export { auth, db, storage }
export {
  validateComplaintPhoto,
  uploadComplaintPhoto,
  uploadComplaintAudio,
  deleteStorageFile,
  deleteComplaintEvidence,
} from './storage'
export default app
