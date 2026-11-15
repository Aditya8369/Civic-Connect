import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const RULES = readFileSync(
  fileURLToPath(new URL('../../firestore.rules', import.meta.url)),
  'utf8'
)

const PROJECT_ID = 'demo-civic-connect'
const [EMULATOR_HOST, EMULATOR_PORT] = (
  process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
).split(':')

let testEnv

function makeIssue(overrides = {}) {
  return {
    complaintId: 'CMP-2026-0001',
    title: 'Broken streetlight on Main St',
    description: 'The lamp post outside 12 Main Street is dark at night.',
    category: 'Electricity',
    address: '12 Main Street',
    latitude: 12.9716,
    longitude: 77.5946,
    status: 'Pending',
    department: '',
    reportedBy: 'citizen-alice',
    imageUrl: null,
    photos: [],
    audioNote: null,
    endorsedBy: [],
    endorsementCount: 0,
    upvotedBy: [],
    upvotesCount: 0,
    createdAt: Timestamp.fromMillis(Date.now()),
    updatedAt: Timestamp.fromMillis(Date.now()),
    ...overrides,
  }
}

function makeClientIssue(overrides = {}) {
  return {
    ...makeIssue(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function issue(overrides = {}) {
  return makeIssue(overrides)
}

function daysAgo(days) {
  return Timestamp.fromMillis(Date.now() - days * 24 * 60 * 60 * 1000)
}

function feedbackPayload(overrides = {}) {
  return {
    rating: 5,
    tags: ['Quick response', 'Clean finish'],
    comment: 'Repaired quickly and thoroughly.',
    attachment: null,
    submittedAt: serverTimestamp(),
    ...overrides,
  }
}

async function seedData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const now = Timestamp.fromMillis(Date.now())

    await setDoc(doc(db, 'users', 'citizen-alice'), {
      name: 'Alice Citizen',
      email: 'alice@civic.test',
      role: 'citizen',
      createdAt: now,
    })
    await setDoc(doc(db, 'users', 'citizen-bob'), {
      name: 'Bob Citizen',
      email: 'bob@civic.test',
      role: 'citizen',
      createdAt: now,
    })
    await setDoc(doc(db, 'users', 'admin-carol'), {
      name: 'Carol Admin',
      email: 'carol@civic.test',
      role: 'admin',
      createdAt: now,
    })

    await setDoc(doc(db, 'issues', 'issue-pending-alice'), issue())
    await setDoc(doc(db, 'issues', 'issue-in-progress-alice'), issue({
      status: 'In Progress',
      department: 'Electrical Department',
    }))
    await setDoc(doc(db, 'issues', 'issue-resolved-alice'), issue({
      status: 'Resolved',
      department: 'Electrical Department',
      resolvedAt: now,
    }))
    await setDoc(doc(db, 'issues', 'issue-old-resolved-alice'), issue({
      status: 'Resolved',
      department: 'Electrical Department',
      resolvedAt: daysAgo(8),
    }))
    await setDoc(doc(db, 'issues', 'issue-pending-bob'), issue({
      reportedBy: 'citizen-bob',
      complaintId: 'CMP-2026-0002',
    }))

    await setDoc(doc(db, 'counters', 'issueCounter'), { lastNumber: 10 })

    await setDoc(doc(db, 'notifications', 'notif-alice'), {
      recipientUid: 'citizen-alice',
      recipientRole: 'citizen',
      senderUid: 'admin-carol',
      issueId: 'CMP-2026-0001',
      type: 'status_update',
      title: 'Status Updated',
      message: 'Your report is now In Progress',
      read: false,
      createdAt: now,
    })
    await setDoc(doc(db, 'notifications', 'notif-admin'), {
      recipientUid: null,
      recipientRole: 'admin',
      senderUid: 'citizen-alice',
      issueId: 'CMP-2026-0001',
      type: 'new_complaint',
      title: 'New Complaint',
      message: 'New complaint reported',
      read: false,
      createdAt: now,
    })

    await setDoc(doc(db, 'settings', 'resolutionTemplates'), {
      templates: [{ id: 'pothole-filled', title: 'Pothole filled', body: 'Done.' }],
      updatedAt: now,
      updatedBy: 'admin-carol',
    })

    await setDoc(doc(db, 'broadcasts', 'broadcast-1'), {
      title: 'Water maintenance',
      message: 'Supply will be interrupted on Sunday.',
      severity: 'warning',
      active: true,
      createdAt: now,
      createdBy: 'admin-carol',
    })

    await setDoc(doc(db, 'leaderboard', 'citizen-alice'), {
      uid: 'citizen-alice',
      name: 'Alice Citizen',
      monthlyScore: 150,
      allTimeScore: 400,
      badgesCount: 3,
      reportsCount: 4,
      level: 2,
      updatedAt: now,
    })
  })
}

describe('Firestore Security Rules (Issue #20 Hardening)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: RULES,
        host: EMULATOR_HOST,
        port: Number(EMULATOR_PORT),
      },
    })
  })

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup()
  })

  beforeEach(async () => {
    await testEnv.clearFirestore()
    await seedData()
  })

  const alice = () => testEnv.authenticatedContext('citizen-alice').firestore()
  const bob = () => testEnv.authenticatedContext('citizen-bob').firestore()
  const admin = () =>
    testEnv.authenticatedContext('admin-carol', { role: 'admin' }).firestore()
  const anon = () => testEnv.unauthenticatedContext().firestore()

  // -------------------------------------------------------------------------
  // 1. Anonymous Persona
  // -------------------------------------------------------------------------
  describe('Anonymous / Unauthenticated Access', () => {
    it('denies anonymous reads of every protected collection', async () => {
      const db = anon()
      await assertFails(getDoc(doc(db, 'users', 'citizen-alice')))
      await assertFails(getDoc(doc(db, 'issues', 'issue-pending-alice')))
      await assertFails(getDocs(collection(db, 'issues')))
      await assertFails(getDoc(doc(db, 'notifications', 'notif-alice')))
      await assertFails(getDoc(doc(db, 'leaderboard', 'citizen-alice')))
      await assertFails(getDoc(doc(db, 'broadcasts', 'broadcast-1')))
      await assertFails(getDoc(doc(db, 'settings', 'resolutionTemplates')))
      await assertFails(getDoc(doc(db, 'counters', 'issueCounter')))
      await assertFails(
        getDoc(doc(db, 'issues', 'issue-pending-alice', 'comments', 'comment-1'))
      )
      await assertFails(
        getDoc(doc(db, 'issues', 'issue-pending-alice', 'events', 'event-1'))
      )
    })

    it('denies anonymous issue creation and counter manipulation', async () => {
      const db = anon()
      await assertFails(setDoc(doc(db, 'issues', 'anon-issue'), makeClientIssue()))
      await assertFails(
        updateDoc(doc(db, 'counters', 'issueCounter'), { lastNumber: 11 })
      )
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'anon-uid'), {
          uid: 'anon-uid',
          monthlyScore: 1,
          allTimeScore: 1,
          updatedAt: serverTimestamp(),
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 2. User Profiles & Role Protection (/users/{userId})
  // -------------------------------------------------------------------------
  describe('User Profiles & Role Protection', () => {
    it('allows public signup strictly with role: citizen', async () => {
      const db = testEnv.authenticatedContext('citizen-new').firestore()
      await assertSucceeds(
        setDoc(doc(db, 'users', 'citizen-new'), {
          name: 'New Citizen',
          email: 'new@civic.test',
          role: 'citizen',
          createdAt: serverTimestamp(),
        })
      )
    })

    it('DENIES public signup attempting to mint role: admin', async () => {
      const db = testEnv.authenticatedContext('hacker-uid').firestore()
      await assertFails(
        setDoc(doc(db, 'users', 'hacker-uid'), {
          name: 'Hacker',
          email: 'hacker@civic.test',
          role: 'admin',
          createdAt: serverTimestamp(),
        })
      )
    })

    it('DENIES public signup attempting to mint role: officer', async () => {
      const db = testEnv.authenticatedContext('officer-uid').firestore()
      await assertFails(
        setDoc(doc(db, 'users', 'officer-uid'), {
          name: 'Officer Candidate',
          email: 'officer@civic.test',
          role: 'officer',
          createdAt: serverTimestamp(),
        })
      )
    })

    it('DENIES signup with extra privilege-bearing fields', async () => {
      const db = testEnv.authenticatedContext('extra-uid').firestore()
      await assertFails(
        setDoc(doc(db, 'users', 'extra-uid'), {
          name: 'Extra',
          email: 'extra@civic.test',
          role: 'citizen',
          permissions: ['manageUsers'],
          createdAt: serverTimestamp(),
        })
      )
    })

    it('DENIES creating a profile for another user UID', async () => {
      const db = alice()
      await assertFails(
        setDoc(doc(db, 'users', 'citizen-victim'), {
          name: 'Victim',
          email: 'victim@civic.test',
          role: 'citizen',
          createdAt: serverTimestamp(),
        })
      )
    })

    it('allows citizen to update own profile fields', async () => {
      const db = alice()
      await assertSucceeds(
        updateDoc(doc(db, 'users', 'citizen-alice'), {
          name: 'Alice Updated',
          phone: '+919876543210',
          address: '42 Civic Ave',
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('DENIES citizen from modifying their own role, email or createdAt', async () => {
      const db = alice()
      await assertFails(updateDoc(doc(db, 'users', 'citizen-alice'), { role: 'admin' }))
      await assertFails(
        updateDoc(doc(db, 'users', 'citizen-alice'), { email: 'attacker@civic.test' })
      )
      await assertFails(
        updateDoc(doc(db, 'users', 'citizen-alice'), { createdAt: serverTimestamp() })
      )
    })

    it('validates notification preference structure', async () => {
      const db = alice()
      await assertSucceeds(
        updateDoc(doc(db, 'users', 'citizen-alice'), {
          notificationPreferences: { sound: true, push: false, emailDigest: true },
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(db, 'users', 'citizen-alice'), {
          notificationPreferences: { sound: 'yes' },
        })
      )
      await assertFails(
        updateDoc(doc(db, 'users', 'citizen-alice'), {
          notificationPreferences: { theme: 'dark' },
        })
      )
    })

    it('DENIES citizen from reading another citizen profile', async () => {
      await assertFails(getDoc(doc(alice(), 'users', 'citizen-bob')))
    })

    it('allows admin to read any profile (claim and users-document fallback)', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'users', 'citizen-alice')))

      const fallbackAdmin = testEnv.authenticatedContext('admin-carol').firestore()
      await assertSucceeds(getDoc(doc(fallbackAdmin, 'users', 'citizen-alice')))
    })
  })

  // -------------------------------------------------------------------------
  // 3. Complaint Lifecycle & Ownership (/issues/{issueId})
  // -------------------------------------------------------------------------
  describe('Complaint Lifecycle & Access Control', () => {
    it('allows a citizen to report a clean Pending complaint', async () => {
      await assertSucceeds(
        setDoc(doc(alice(), 'issues', 'alice-new-issue'), makeClientIssue({
          complaintId: 'CMP-2026-0007',
          title: 'Pothole on 5th street',
          description: 'Large pothole in right lane.',
          category: 'Roads',
          address: '5th Street',
        }))
      )
    })

    it('allows complaint creation without a tracking ID (allocated later)', async () => {
      const payload = makeClientIssue({ complaintId: undefined })
      delete payload.complaintId
      await assertSucceeds(setDoc(doc(alice(), 'issues', 'alice-no-id'), payload))
    })

    it('DENIES non-Pending creation, spoofed reporters and protected workflow fields', async () => {
      const db = alice()
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-invalid-status'), makeClientIssue({ status: 'Resolved' }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-spoofed'), makeClientIssue({ reportedBy: 'citizen-bob' }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-department'), makeClientIssue({
          department: 'Hacked Department',
        }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-resolved-at'), makeClientIssue({
          resolvedAt: serverTimestamp(),
        }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-feedback'), makeClientIssue({
          feedback: { rating: 5 },
        }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-worker'), makeClientIssue({
          assignedWorker: { name: 'Fake' },
        }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-bad-id'), makeClientIssue({
          complaintId: 'ADMIN-0001',
        }))
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'alice-forged-endorsements'), makeClientIssue({
          endorsedBy: ['citizen-bob'],
          endorsementCount: 1,
        }))
      )
    })

    it('allows citizen to edit public fields of own Pending complaint', async () => {
      await assertSucceeds(
        updateDoc(doc(alice(), 'issues', 'issue-pending-alice'), {
          title: 'Updated title',
          description: 'Updated description with more details.',
          category: 'Roads',
          address: '14 Main Street',
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('DENIES citizen from modifying protected fields during a Pending edit', async () => {
      const db = alice()
      for (const patch of [
        { department: 'Hacked Department' },
        { complaintId: 'CMP-9999-9999' },
        { reportedBy: 'citizen-bob' },
        { createdAt: serverTimestamp() },
        { endorsementCount: 99 },
        { upvotesCount: 99 },
        { status: 'Resolved' },
      ]) {
        await assertFails(
          updateDoc(doc(db, 'issues', 'issue-pending-alice'), {
            ...patch,
            updatedAt: serverTimestamp(),
          })
        )
      }
    })

    it('DENIES editing another citizen complaint or a non-Pending complaint', async () => {
      await assertFails(
        updateDoc(doc(bob(), 'issues', 'issue-pending-alice'), {
          title: 'Bob tampering with Alice complaint',
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-in-progress-alice'), {
          title: 'Attempting to change in-progress issue',
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-resolved-alice'), {
          title: 'Attempting to change resolved issue',
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('restricts deletion to the reporter and Pending status', async () => {
      await assertSucceeds(deleteDoc(doc(alice(), 'issues', 'issue-pending-alice')))
      await assertFails(deleteDoc(doc(alice(), 'issues', 'issue-in-progress-alice')))
      await assertFails(deleteDoc(doc(alice(), 'issues', 'issue-pending-bob')))
      await assertFails(deleteDoc(doc(admin(), 'issues', 'issue-pending-bob')))
    })

    it('allows admin workflow updates but not deletion or reporter spoofing by citizens', async () => {
      await assertSucceeds(
        updateDoc(doc(admin(), 'issues', 'issue-pending-alice'), {
          status: 'In Progress',
          department: 'Water Supply Department',
          resolutionNotes: 'Crew dispatched',
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-pending-alice'), {
          status: 'Resolved',
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('allows signed-in residents to read community complaint records', async () => {
      // CommunityFeed, the public map, duplicate detection and consolidated
      // tickets rely on this read. Private records remain owner-scoped.
      await assertSucceeds(getDoc(doc(bob(), 'issues', 'issue-pending-alice')))
      await assertSucceeds(getDocs(collection(bob(), 'issues')))
    })
  })

  // -------------------------------------------------------------------------
  // 4. Upvotes & Endorsements
  // -------------------------------------------------------------------------
  describe('Community Voting Integrity', () => {
    it('allows atomic +1 / -1 upvotes and forbids array injection', async () => {
      const db = bob()
      const ref = doc(db, 'issues', 'issue-pending-alice')

      await assertSucceeds(
        runTransaction(db, async (tx) => {
          const snap = await tx.get(ref)
          tx.update(ref, {
            upvotedBy: [...snap.data().upvotedBy, 'citizen-bob'],
            upvotesCount: snap.data().upvotesCount + 1,
            updatedAt: serverTimestamp(),
          })
        })
      )

      await assertFails(
        runTransaction(db, async (tx) => {
          const snap = await tx.get(ref)
          tx.update(ref, {
            upvotedBy: [...snap.data().upvotedBy, 'citizen-bob', 'citizen-victim'],
            upvotesCount: snap.data().upvotesCount + 2,
            updatedAt: serverTimestamp(),
          })
        })
      )

      await assertSucceeds(
        runTransaction(db, async (tx) => {
          const snap = await tx.get(ref)
          const next = snap.data().upvotedBy.filter((uid) => uid !== 'citizen-bob')
          tx.update(ref, {
            upvotedBy: next,
            upvotesCount: snap.data().upvotesCount - 1,
          })
        })
      )
    })

    it('DENIES forged upvote timestamps and arbitrary counter inflation', async () => {
      const db = bob()
      const ref = doc(db, 'issues', 'issue-pending-alice')
      await assertFails(
        updateDoc(ref, {
          upvotedBy: ['citizen-bob'],
          upvotesCount: 1,
          updatedAt: Timestamp.fromMillis(Date.now() - 60000),
        })
      )
      await assertFails(
        updateDoc(ref, { upvotesCount: 100 })
      )
    })

    it('allows endorsement only for the caller and only +1', async () => {
      const db = bob()
      const ref = doc(db, 'issues', 'issue-pending-alice')

      await assertSucceeds(
        updateDoc(ref, {
          endorsedBy: ['citizen-bob'],
          endorsementCount: 1,
          updatedAt: serverTimestamp(),
        })
      )

      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-pending-bob'), {
          endorsedBy: ['citizen-alice', 'citizen-victim'],
          endorsementCount: 2,
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-pending-bob'), {
          endorsedBy: ['citizen-alice'],
          endorsementCount: 1,
          updatedAt: Timestamp.fromMillis(Date.now() - 60000),
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 5. Resolution Feedback & Appeals
  // -------------------------------------------------------------------------
  describe('Resolution Feedback & Citizen Appeals', () => {
    it('allows the owner to submit valid feedback with or without a comment', async () => {
      const db = alice()
      await assertSucceeds(
        updateDoc(doc(db, 'issues', 'issue-resolved-alice'), {
          feedback: feedbackPayload(),
          updatedAt: serverTimestamp(),
        })
      )

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'issues', 'issue-resolved-2'), issue({
          status: 'Resolved',
          resolvedAt: Timestamp.fromMillis(Date.now()),
        }))
      })
      await assertSucceeds(
        updateDoc(doc(db, 'issues', 'issue-resolved-2'), {
          feedback: {
            rating: 3,
            submittedAt: serverTimestamp(),
          },
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('DENIES feedback from other users, on non-resolved issues, or overwrites', async () => {
      await assertFails(
        updateDoc(doc(bob(), 'issues', 'issue-resolved-alice'), {
          feedback: feedbackPayload(),
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-pending-alice'), {
          feedback: feedbackPayload(),
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-resolved-alice'), {
          feedback: feedbackPayload({ rating: 6 }),
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(alice(), 'issues', 'issue-resolved-alice'), {
          feedback: feedbackPayload({
            attachment: {
              kind: 'photo',
              path: `resolution-feedback/citizen-bob/issue-resolved-alice/${randomUUID()}`,
            },
          }),
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('allows a timely appeal with ticket and audit event, denies late/blank appeals', async () => {
      const db = alice()
      const issueRef = doc(db, 'issues', 'issue-resolved-alice')
      const eventRef = doc(
        collection(db, 'issues', 'issue-resolved-alice', 'events'),
        'appeal-1'
      )

      await assertSucceeds(
        runTransaction(db, async (tx) => {
          tx.update(issueRef, {
            status: 'Reopened',
            reopenReason: 'The light is still broken.',
            reopenedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
          tx.set(eventRef, {
            timestamp: serverTimestamp(),
            actorUid: 'citizen-alice',
            action: 'Status changed',
            previousStatus: 'Resolved',
            newStatus: 'Reopened',
            remarks: 'The light is still broken.',
          })
        })
      )

      await assertFails(
        updateDoc(doc(db, 'issues', 'issue-old-resolved-alice'), {
          status: 'Reopened',
          reopenReason: 'Too late',
          reopenedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        updateDoc(doc(db, 'issues', 'issue-resolved-alice'), {
          status: 'Reopened',
          reopenReason: '   ',
          reopenedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 6. Notifications
  // -------------------------------------------------------------------------
  describe('Notification Ownership & Permissions', () => {
    it('enforces owner/admin read access', async () => {
      await assertSucceeds(getDoc(doc(alice(), 'notifications', 'notif-alice')))
      await assertFails(getDoc(doc(bob(), 'notifications', 'notif-alice')))
      await assertFails(getDoc(doc(alice(), 'notifications', 'notif-admin')))
      await assertSucceeds(getDoc(doc(admin(), 'notifications', 'notif-admin')))
    })

    it('only allows toggling read on an owned notification', async () => {
      await assertSucceeds(
        updateDoc(doc(alice(), 'notifications', 'notif-alice'), { read: true })
      )
      await assertFails(
        updateDoc(doc(bob(), 'notifications', 'notif-alice'), { read: true })
      )
      await assertFails(
        updateDoc(doc(alice(), 'notifications', 'notif-alice'), {
          read: true,
          title: 'Tampered',
        })
      )
      await assertFails(deleteDoc(doc(alice(), 'notifications', 'notif-alice')))
    })

    it('restricts citizen creates to the admin desk and admin creates to real recipients', async () => {
      const now = serverTimestamp()
      await assertSucceeds(
        setDoc(doc(alice(), 'notifications', 'alice-new-notif'), {
          recipientRole: 'admin',
          recipientUid: null,
          senderUid: 'citizen-alice',
          issueId: 'CMP-2026-0001',
          type: 'new_complaint',
          title: 'New Complaint Submitted',
          message: 'A citizen has submitted a new complaint.',
          read: false,
          createdAt: now,
        })
      )
      await assertFails(
        setDoc(doc(alice(), 'notifications', 'alice-target-bob'), {
          recipientRole: 'citizen',
          recipientUid: 'citizen-bob',
          senderUid: 'citizen-alice',
          issueId: 'CMP-2026-0001',
          type: 'status_update',
          title: 'Spam notification',
          message: 'You have been spammed.',
          read: false,
          createdAt: now,
        })
      )
      await assertSucceeds(
        setDoc(doc(admin(), 'notifications', 'admin-to-citizen'), {
          recipientRole: 'citizen',
          recipientUid: 'citizen-alice',
          senderUid: 'admin-carol',
          issueId: 'CMP-2026-0001',
          type: 'status_update',
          title: 'Status Updated',
          message: 'Your complaint is In Progress.',
          read: false,
          createdAt: serverTimestamp(),
        })
      )
      await assertFails(
        setDoc(doc(admin(), 'notifications', 'admin-unaddressed'), {
          recipientRole: 'citizen',
          recipientUid: null,
          senderUid: 'admin-carol',
          issueId: 'CMP-2026-0001',
          type: 'status_update',
          title: 'Status Updated',
          message: 'No recipient.',
          read: false,
          createdAt: serverTimestamp(),
        })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 7. Counters
  // -------------------------------------------------------------------------
  describe('Counter Security', () => {
    it('allows exactly +1 and blocks inflation, decrement and deletes', async () => {
      const db = alice()
      const ref = doc(db, 'counters', 'issueCounter')
      await assertSucceeds(updateDoc(ref, { lastNumber: 11 }))
      await assertFails(updateDoc(ref, { lastNumber: 111 }))
      await assertFails(updateDoc(ref, { lastNumber: 5 }))
      await assertFails(updateDoc(ref, { lastNumber: '12' }))
      await assertFails(deleteDoc(ref))
    })

    it('requires new counters to start at integer 1', async () => {
      await assertSucceeds(
        setDoc(doc(alice(), 'counters', 'issueCounter2'), { lastNumber: 1 })
      )
      await assertFails(
        setDoc(doc(alice(), 'counters', 'issueCounter3'), { lastNumber: 5 })
      )
    })
  })

  // -------------------------------------------------------------------------
  // 8. Leaderboard
  // -------------------------------------------------------------------------
  describe('Leaderboard Projection', () => {
    it('allows a citizen to write only their own bounded projection', async () => {
      await assertSucceeds(
        setDoc(doc(alice(), 'leaderboard', 'citizen-alice'), {
          uid: 'citizen-alice',
          name: 'Alice Citizen',
          monthlyScore: 250,
          allTimeScore: 500,
          badgesCount: 4,
          reportsCount: 5,
          level: 3,
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        setDoc(doc(bob(), 'leaderboard', 'citizen-alice'), {
          uid: 'citizen-alice',
          name: 'Hacked',
          monthlyScore: 9999,
          allTimeScore: 9999,
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        setDoc(doc(alice(), 'leaderboard', 'citizen-alice'), {
          uid: 'spoofed-uid',
          monthlyScore: 1,
          allTimeScore: 1,
          updatedAt: serverTimestamp(),
        })
      )
    })

    it('rejects PII, invalid bounds, cross-field lies and forged timestamps', async () => {
      const db = alice()
      const base = {
        uid: 'citizen-alice',
        name: 'Alice',
        monthlyScore: 10,
        allTimeScore: 20,
        updatedAt: serverTimestamp(),
      }
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'citizen-alice'), { ...base, email: 'a@b.test' })
      )
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'citizen-alice'), { ...base, monthlyScore: -1 })
      )
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'citizen-alice'), { ...base, monthlyScore: '10' })
      )
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'citizen-alice'), {
          ...base,
          monthlyScore: 30,
          allTimeScore: 20,
        })
      )
      await assertFails(
        setDoc(doc(db, 'leaderboard', 'citizen-alice'), {
          ...base,
          updatedAt: Timestamp.fromMillis(Date.now() - 60000),
        })
      )
    })

    it('allows public reads, forbids self-delete and allows admin delete', async () => {
      await assertSucceeds(getDoc(doc(bob(), 'leaderboard', 'citizen-alice')))
      await assertFails(deleteDoc(doc(alice(), 'leaderboard', 'citizen-alice')))
      await assertSucceeds(deleteDoc(doc(admin(), 'leaderboard', 'citizen-alice')))
    })
  })

  // -------------------------------------------------------------------------
  // 9. Comments & Audit Events
  // -------------------------------------------------------------------------
  describe('Comments & Audit Trail Subcollections', () => {
    it('allows authenticated comments and enforces authorship/schema', async () => {
      const db = alice()
      const commentRef = doc(db, 'issues', 'issue-pending-alice', 'comments', 'comment-1')
      await assertSucceeds(
        setDoc(commentRef, {
          authorId: 'citizen-alice',
          authorName: 'Alice Citizen',
          text: 'Any update on this issue?',
          createdAt: serverTimestamp(),
        })
      )
      await assertSucceeds(
        updateDoc(commentRef, { text: 'Edited comment', updatedAt: serverTimestamp() })
      )
      await assertFails(
        updateDoc(doc(bob(), 'issues', 'issue-pending-alice', 'comments', 'comment-1'), {
          text: 'Hijacked',
          updatedAt: serverTimestamp(),
        })
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'comments', 'comment-spoofed'), {
          authorId: 'citizen-bob',
          text: 'Spoofed comment',
          createdAt: serverTimestamp(),
        })
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'comments', 'comment-extra'), {
          authorId: 'citizen-alice',
          text: 'Extra field',
          pinned: true,
          createdAt: serverTimestamp(),
        })
      )
      await assertSucceeds(deleteDoc(commentRef))
    })

    it('allows only lifecycle-mirroring citizen events and immutable audit records', async () => {
      const db = alice()
      const eventRef = doc(db, 'issues', 'issue-pending-alice', 'events', 'event-1')
      await assertSucceeds(
        setDoc(eventRef, {
          timestamp: serverTimestamp(),
          actorUid: 'citizen-alice',
          action: 'Complaint submitted',
          previousStatus: null,
          newStatus: 'Pending',
          remarks: 'Initial complaint submission',
        })
      )

      // A citizen cannot fabricate a Reopened transition on a Pending issue.
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'events', 'event-forged'), {
          timestamp: serverTimestamp(),
          actorUid: 'citizen-alice',
          action: 'Status changed',
          previousStatus: 'Resolved',
          newStatus: 'Reopened',
          remarks: 'Forged transition',
        })
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'events', 'event-privileged'), {
          timestamp: serverTimestamp(),
          actorUid: 'citizen-alice',
          action: 'Department assigned',
          remarks: 'Citizen forging department assignment',
        })
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'events', 'event-old-time'), {
          timestamp: Timestamp.fromMillis(Date.now() - 60000),
          actorUid: 'citizen-alice',
          action: 'Complaint submitted',
          newStatus: 'Pending',
        })
      )
      await assertFails(
        setDoc(doc(db, 'issues', 'issue-pending-alice', 'events', 'event-actor'), {
          timestamp: serverTimestamp(),
          actorUid: 'admin-carol',
          action: 'Status changed',
          newStatus: 'Resolved',
        })
      )

      await assertSucceeds(
        setDoc(doc(admin(), 'issues', 'issue-pending-alice', 'events', 'event-admin'), {
          timestamp: serverTimestamp(),
          actorUid: 'admin-carol',
          action: 'Department assigned',
          previousStatus: 'Pending',
          newStatus: 'Pending',
          remarks: 'Assigned to Public Works',
        })
      )
      await assertFails(
        updateDoc(doc(admin(), 'issues', 'issue-pending-alice', 'events', 'event-admin'), {
          remarks: 'Altered audit record',
        })
      )
      await assertFails(
        deleteDoc(doc(admin(), 'issues', 'issue-pending-alice', 'events', 'event-admin'))
      )
    })
  })

  // -------------------------------------------------------------------------
  // 10. Broadcasts, Settings & Offline Receipts
  // -------------------------------------------------------------------------
  describe('Broadcasts, Settings & Offline Receipts', () => {
    it('restricts broadcasts to admins with a valid schema', async () => {
      await assertSucceeds(getDoc(doc(alice(), 'broadcasts', 'broadcast-1')))
      await assertFails(
        setDoc(doc(alice(), 'broadcasts', 'citizen-broadcast'), {
          title: 'Fake emergency',
          message: 'Evacuate now',
          severity: 'critical',
          active: true,
          createdAt: serverTimestamp(),
          createdBy: 'citizen-alice',
        })
      )
      await assertSucceeds(
        setDoc(doc(admin(), 'broadcasts', 'admin-broadcast'), {
          title: 'Water maintenance',
          message: 'Supply will be interrupted on Sunday.',
          severity: 'warning',
          active: true,
          createdAt: serverTimestamp(),
          createdBy: 'admin-carol',
        })
      )
      await assertFails(
        setDoc(doc(admin(), 'broadcasts', 'bad-severity'), {
          title: 'Bad',
          message: 'Bad severity',
          severity: 'apocalypse',
          active: true,
          createdAt: serverTimestamp(),
          createdBy: 'admin-carol',
        })
      )
    })

    it('restricts settings writes and validates resolution templates', async () => {
      await assertSucceeds(getDoc(doc(alice(), 'settings', 'resolutionTemplates')))
      await assertFails(getDoc(doc(alice(), 'settings', 'privateSetting')))
      await assertFails(
        setDoc(doc(alice(), 'settings', 'resolutionTemplates'), {
          templates: [],
          updatedAt: serverTimestamp(),
        }, { merge: true })
      )
      await assertSucceeds(
        setDoc(doc(admin(), 'settings', 'resolutionTemplates'), {
          templates: [{ id: 'pothole-filled', title: 'Pothole filled', body: 'Done.' }],
          updatedAt: serverTimestamp(),
          updatedBy: 'admin-carol',
        }, { merge: true })
      )
      await assertFails(
        setDoc(doc(admin(), 'settings', 'resolutionTemplates'), {
          templates: [],
          updatedAt: Timestamp.fromMillis(Date.now() - 60000),
        }, { merge: true })
      )
    })

    it('keeps offline receipts owner-only and tied to an owned upload', async () => {
      const db = alice()
      const issueRef = doc(db, 'issues', 'offline-issue-1')
      const receiptRef = doc(db, 'users', 'citizen-alice', 'offlineComplaintReceipts', 'offline-issue-1')

      await assertSucceeds(
        runTransaction(db, async (tx) => {
          tx.set(issueRef, makeClientIssue({ complaintId: 'CMP-2026-0008' }))
          tx.set(receiptRef, { createdAt: serverTimestamp() })
        })
      )
      await assertSucceeds(getDoc(receiptRef))
      await assertFails(getDocs(collection(db, 'users', 'citizen-alice', 'offlineComplaintReceipts')))
      await assertFails(
        getDoc(doc(bob(), 'users', 'citizen-alice', 'offlineComplaintReceipts', 'offline-issue-1'))
      )
      await assertFails(
        setDoc(doc(bob(), 'users', 'citizen-bob', 'offlineComplaintReceipts', 'offline-issue-1'), {
          createdAt: serverTimestamp(),
        })
      )
    })
  })
})
