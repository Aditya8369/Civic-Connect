import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

let cachedApp: App | undefined

export function getAdminApp(): App {
  if (cachedApp) return cachedApp
  cachedApp = getApps().find(({ name }) => name === '[DEFAULT]') ?? initializeApp()
  return cachedApp
}

export function getAdminAuth() {
  return getAuth(getAdminApp())
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp())
}
