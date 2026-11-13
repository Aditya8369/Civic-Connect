#!/usr/bin/env node

/**
 * Civic-Connect Firebase Emulator Seed
 *
 * Seeds deterministic local Auth users, Firestore issues, events and
 * notifications. This script must never target a production project.
 */

import process from 'node:process'

const PROJECT_ID =
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'demo-civic-connect'

const AUTH_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'

const FIRESTORE_HOST =
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'

function assertLocalHost(value, variableName) {
  let hostname

  try {
    const normalized = value.includes('://')
      ? value
      : `http://${value}`

    hostname = new URL(normalized).hostname.replace(/^\[|\]$/g, '')
  } catch {
    throw new Error(`${variableName} must be a valid emulator host.`)
  }

  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`${variableName} must point to a local emulator.`)
  }
}

if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error(
    `Refusing to seed non-demo Firebase project: ${PROJECT_ID}`
  )
}

assertLocalHost(AUTH_HOST, 'FIREBASE_AUTH_EMULATOR_HOST')
assertLocalHost(FIRESTORE_HOST, 'FIRESTORE_EMULATOR_HOST')

process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST

const { initializeApp, deleteApp } = await import('firebase-admin/app')
const { getAuth } = await import('firebase-admin/auth')
const { getFirestore, Timestamp } = await import('firebase-admin/firestore')

const app = initializeApp({ projectId: PROJECT_ID })
const auth = getAuth(app)
const db = getFirestore(app)

const PASSWORD = 'CivicConnect123!'
const BASE_DATE = new Date('2026-10-01T09:00:00.000Z')

const accounts = [
  {
    uid: 'seed-admin-001',
    email: 'admin@civicconnect.dev',
    name: 'Demo Administrator',
    role: 'admin',
  },
  {
    uid: 'seed-officer-001',
    email: 'officer@civicconnect.dev',
    name: 'Demo Department Officer',
    role: 'department_officer',
  },
  {
    uid: 'seed-citizen-001',
    email: 'citizen@civicconnect.dev',
    name: 'Demo Citizen',
    role: 'citizen',
  },
]

const complaints = [
  {
    id: 'CMP-2026-9001',
    title: 'Large pothole near main crossing',
    description: 'A large pothole is causing difficulty for vehicles.',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    priority: 'High',
    status: 'In Progress',
    address: 'Demo Ward 01, Civic Avenue, Kolkata',
    latitude: 22.5726,
    longitude: 88.3639,
  },
  {
    id: 'CMP-2026-9002',
    title: 'Water pipeline leakage',
    description: 'Continuous water leakage from a roadside pipeline.',
    category: 'Water Leakage',
    department: 'Water',
    priority: 'High',
    status: 'Pending',
    address: 'Demo Ward 02, River Road, Kolkata',
    latitude: 22.5750,
    longitude: 88.3700,
  },
  {
    id: 'CMP-2026-9003',
    title: 'Streetlight not working',
    description: 'Streetlight has stopped working near the park.',
    category: 'Streetlight Issues',
    department: 'Electricity',
    priority: 'Medium',
    status: 'Resolved',
    address: 'Demo Ward 03, Park Street, Kolkata',
    latitude: 22.5530,
    longitude: 88.3520,
  },
  {
    id: 'CMP-2026-9004',
    title: 'Garbage collection overdue',
    description: 'Garbage has accumulated at the collection point.',
    category: 'Garbage & Sanitation',
    department: 'Sanitation',
    priority: 'High',
    status: 'In Progress',
    address: 'Demo Ward 04, Market Road, Kolkata',
    latitude: 22.5800,
    longitude: 88.3600,
  },
  {
    id: 'CMP-2026-9005',
    title: 'Damaged road surface',
    description: 'The road surface is damaged and needs repair.',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    priority: 'Medium',
    status: 'Pending',
    address: 'Demo Ward 05, Station Road, Kolkata',
    latitude: 22.5680,
    longitude: 88.3800,
  },
  {
    id: 'CMP-2026-9006',
    title: 'Water supply disruption',
    description: 'Water supply has been interrupted in the locality.',
    category: 'Water Leakage',
    department: 'Water',
    priority: 'High',
    status: 'Resolved',
    address: 'Demo Ward 06, Lake Road, Kolkata',
    latitude: 22.5650,
    longitude: 88.3450,
  },
  {
    id: 'CMP-2026-9007',
    title: 'Streetlight flickering',
    description: 'Streetlight flickers throughout the evening.',
    category: 'Streetlight Issues',
    department: 'Electricity',
    priority: 'Low',
    status: 'Pending',
    address: 'Demo Ward 07, Garden Road, Kolkata',
    latitude: 22.5900,
    longitude: 88.3650,
  },
  {
    id: 'CMP-2026-9008',
    title: 'Overflowing community dustbin',
    description: 'The community dustbin is overflowing.',
    category: 'Garbage & Sanitation',
    department: 'Sanitation',
    priority: 'Medium',
    status: 'Rejected',
    address: 'Demo Ward 08, Community Road, Kolkata',
    latitude: 22.5600,
    longitude: 88.3750,
  },
  {
    id: 'CMP-2026-9009',
    title: 'Roadside drainage damage',
    description: 'Drainage cover near the road is damaged.',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    priority: 'High',
    status: 'Resolved',
    address: 'Demo Ward 09, Central Road, Kolkata',
    latitude: 22.5800,
    longitude: 88.3500,
  },
  {
    id: 'CMP-2026-9010',
    title: 'Public water tap leakage',
    description: 'A public water tap continues to leak.',
    category: 'Water Leakage',
    department: 'Water',
    priority: 'Low',
    status: 'In Progress',
    address: 'Demo Ward 10, Civic Lane, Kolkata',
    latitude: 22.5700,
    longitude: 88.3900,
  },
]

function dateAt(day, hour = 9) {
  const date = new Date(BASE_DATE)
  date.setUTCDate(date.getUTCDate() + day)
  date.setUTCHours(hour, 0, 0, 0)
  return Timestamp.fromDate(date)
}

async function seedAccounts() {
  for (const account of accounts) {
    const userData = {
      email: account.email,
      password: PASSWORD,
      displayName: account.name,
      disabled: false,
    }

    try {
      await auth.getUser(account.uid)
      await auth.updateUser(account.uid, userData)
    } catch (error) {
      if (error.code !== 'auth/user-not-found') throw error

      await auth.createUser({
        uid: account.uid,
        ...userData,
      })
    }

    await auth.setCustomUserClaims(account.uid, {
      role: account.role,
    })

    await db.collection('users').doc(account.uid).set({
      name: account.name,
      email: account.email,
      role: account.role,
      createdAt: dateAt(0),
    }, { merge: true })

    console.log(`  Auth account ready: ${account.email} (${account.role})`)
  }
}

async function seedComplaints() {
  const citizenUid = 'seed-citizen-001'
  const officerUid = 'seed-officer-001'

  for (let index = 0; index < complaints.length; index++) {
    const complaint = complaints[index]
    const issueId = `seed-issue-${String(index + 1).padStart(3, '0')}`
    const issueRef = db.collection('issues').doc(issueId)

    const history = [
      {
        actorUid: citizenUid,
        action: 'Complaint submitted',
        previousStatus: null,
        newStatus: 'Pending',
        remarks: 'Complaint submitted by demo citizen.',
        timestamp: dateAt(index, 9),
      },
    ]

    if (complaint.status === 'In Progress') {
      history.push({
        actorUid: officerUid,
        action: 'Complaint assigned for investigation',
        previousStatus: 'Pending',
        newStatus: 'In Progress',
        remarks: 'Department officer is investigating the complaint.',
        timestamp: dateAt(index + 1, 11),
      })
    }

    if (
      complaint.status === 'Resolved' ||
      complaint.status === 'Rejected'
    ) {
      history.push({
        actorUid: officerUid,
        action: 'Complaint assigned for investigation',
        previousStatus: 'Pending',
        newStatus: 'In Progress',
        remarks: 'Department officer started investigating the complaint.',
        timestamp: dateAt(index + 1, 11),
      })

      history.push({
        actorUid: officerUid,
        action: complaint.status === 'Resolved'
          ? 'Complaint resolved'
          : 'Complaint rejected',
        previousStatus: 'In Progress',
        newStatus: complaint.status,
        remarks: complaint.status === 'Resolved'
          ? 'The reported issue has been resolved.'
          : 'The complaint could not be validated during inspection.',
        timestamp: dateAt(index + 2, 15),
      })
    }

    const createdAt = dateAt(index, 9)
    const updatedAt = history[history.length - 1].timestamp

    await issueRef.set({
      complaintId: complaint.id,
      title: complaint.title,
      description: complaint.description,
      category: complaint.category,
      address: complaint.address,
      latitude: complaint.latitude,
      longitude: complaint.longitude,
      status: complaint.status,
      department: complaint.department,
      priority: complaint.priority,
      reportedBy: citizenUid,
      imageUrl: null,
      photos: [],
      audioNote: null,
      endorsedBy: [],
      endorsementCount: 0,
      createdAt,
      updatedAt,
    })

    const eventsRef = issueRef.collection('events')

    // Remove only previously seeded timeline events.
    const existingEvents = await eventsRef.get()
    const seededEvents = existingEvents.docs.filter(
      (eventDoc) => eventDoc.id.startsWith('seed-event-')
    )

    const deleteBatch = db.batch()

    seededEvents.forEach((eventDoc) => {
      deleteBatch.delete(eventDoc.ref)
    })

    if (seededEvents.length > 0) {
      await deleteBatch.commit()
    }

    for (let eventIndex = 0; eventIndex < history.length; eventIndex++) {
      await eventsRef
        .doc(`seed-event-${String(eventIndex + 1).padStart(2, '0')}`)
        .set(history[eventIndex])
    }

    await db.collection('notifications')
      .doc(`seed-notification-${String(index + 1).padStart(3, '0')}`)
      .set({
        recipientRole: 'admin',
        senderUid: citizenUid,
        issueId: complaint.id,
        type: 'new_complaint',
        title: 'New Complaint Submitted',
        message: `A citizen submitted: ${complaint.title}`,
        read: false,
        createdAt,
      })

    console.log(`  Seeded ${complaint.id}: ${complaint.status}`)
  }
}

async function main() {
  console.log(`Seeding Civic-Connect project: ${PROJECT_ID}`)
  console.log(`Auth emulator: ${AUTH_HOST}`)
  console.log(`Firestore emulator: ${FIRESTORE_HOST}`)

  await seedAccounts()
  await seedComplaints()

  await db.collection('counters').doc('issueCounter').set({
    lastNumber: 9010,
  }, { merge: true })

  console.log('\nSeed completed successfully.')
  console.log('Accounts: 3 | Complaints: 10 | Notifications: 10')
}

try {
  await main()
} catch (error) {
  console.error('\nEmulator seeding failed:', error)
  process.exitCode = 1
} finally {
  await deleteApp(app)
}
