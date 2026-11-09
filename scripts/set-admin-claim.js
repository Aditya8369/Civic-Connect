#!/usr/bin/env node

/**
 * Civic-Connect Administrative Custom Claims Provisioning Script
 *
 * This script assigns Firebase Custom Auth Claims (e.g. { role: 'admin' }) to a target user.
 * Custom claims are cryptographically signed into the user's ID token and enforced by
 * Cloud Firestore security rules (request.auth.token.role) and React route guards.
 *
 * Requirements:
 *   1. Service account credentials:
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
 *      or place `serviceAccountKey.json` in the project root.
 *   2. Run with firebase-admin available:
 *      npx firebase-admin / npm install --no-save firebase-admin
 *
 * Usage:
 *   node scripts/set-admin-claim.js <email-or-uid> [role]
 *
 * Examples:
 *   node scripts/set-admin-claim.js admin@civicconnect.dev admin
 *   node scripts/set-admin-claim.js citizen@civicconnect.dev citizen
 *   node scripts/set-admin-claim.js user_2bJ8x9A1 admin
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

async function main() {
  const args = process.argv.slice(2)
  const identifier = args[0]
  const targetRole = args[1] || 'admin'

  if (!identifier) {
    console.error('❌ Error: Missing user identifier (email or UID).')
    console.log('\nUsage:\n  node scripts/set-admin-claim.js <email-or-uid> [role]')
    console.log('\nExample:\n  node scripts/set-admin-claim.js admin@civicconnect.dev admin\n')
    process.exit(1)
  }

  if (!['admin', 'citizen'].includes(targetRole)) {
    console.error(`❌ Error: Invalid role "${targetRole}". Allowed roles are: admin, citizen.`)
    process.exit(1)
  }

  let admin
  try {
    admin = (await import('firebase-admin')).default
  } catch {
    console.error(
      '❌ Error: "firebase-admin" is required to run this script.\n' +
      'Please install it locally or run via:\n' +
      '  npm install --no-save firebase-admin\n'
    )
    process.exit(1)
  }

  // Initialize Firebase Admin with Application Default Credentials or local service key
  if (!admin.apps.length) {
    const localKeyPath = path.resolve(process.cwd(), 'serviceAccountKey.json')
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      })
    } else if (fs.existsSync(localKeyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'))
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      })
    } else {
      console.warn(
        '⚠️ Warning: No GOOGLE_APPLICATION_CREDENTIALS or serviceAccountKey.json found.\n' +
        'Attempting default initialization (works in Google Cloud environments and Firebase Emulators)...'
      )
      admin.initializeApp()
    }
  }

  const auth = admin.auth()
  const db = admin.firestore()

  let userRecord
  try {
    if (identifier.includes('@')) {
      userRecord = await auth.getUserByEmail(identifier.trim().toLowerCase())
    } else {
      userRecord = await auth.getUser(identifier.trim())
    }
  } catch (err) {
    console.error(`❌ Error locating user "${identifier}": ${err.message}`)
    process.exit(1)
  }

  console.log(`👤 Found user: ${userRecord.email || userRecord.uid} (UID: ${userRecord.uid})`)
  console.log(`🔐 Current custom claims:`, userRecord.customClaims || {})

  // Set the cryptographic custom claim
  const newClaims = { ...(userRecord.customClaims || {}), role: targetRole }
  await auth.setCustomUserClaims(userRecord.uid, newClaims)

  // Synchronize Firestore user document role field
  const userRef = db.collection('users').doc(userRecord.uid)
  await userRef.set({ role: targetRole }, { merge: true })

  console.log(`✅ Success! Custom claim { role: "${targetRole}" } provisioned for ${userRecord.email || userRecord.uid}.`)
  console.log('ℹ️ Note: If the user is currently signed in, they will receive the new claim on their next token refresh or re-login.')
}

main().catch((err) => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})

