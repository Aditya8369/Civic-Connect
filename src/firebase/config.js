const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const validApiKey = !apiKey || apiKey === 'ci-placeholder' ? 'AIzaSyA00000000000000000000000000000000' : apiKey

const firebaseConfig = {
  apiKey: validApiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'civicconnect-ci',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'civicconnect-ci.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:0000000000000000000000',
}

export default firebaseConfig
