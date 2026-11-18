import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchComplaintToOfficer } from './complaintLifecycle'
import { createTransactionStore } from './testSupport/transactionStore'

const runtime = vi.hoisted(() => ({
  store: null,
  notificationCounter: 0,
}))

vi.mock('./services', () => ({
  db: { name: 'mock-db' },
}))

vi.mock('firebase/firestore', () => ({
  doc: (ref, ...parts) => {
    return parts.length ? parts.join('/') : ref + '/' + ++runtime.notificationCounter
  },
  collection: (_db, name) => name,
  runTransaction: (_db, callback) =>
    runtime.store.runTransaction(_db, (tx) =>
      callback({
        ...tx,
        get: async (ref) => {
          const snap = await tx.get(ref)
          return {
            exists: () => snap.exists(),
            data: () => snap.data(),
          }
        },
      })
    ),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}))

describe('dispatchComplaintToOfficer Transaction', () => {
  const adminUser = { uid: 'admin-1', role: 'admin', name: 'Admin Jane' }
  const citizenUser = { uid: 'citizen-1', role: 'citizen', name: 'Citizen John' }

  beforeEach(() => {
    runtime.notificationCounter = 0
    runtime.store = createTransactionStore({
      'issues/cmp-101': {
        complaintId: 'CMP-2026-0101',
        title: 'Broken Pothole',
        department: 'Roads',
        category: 'Potholes & Road Damage',
        status: 'Pending',
        reportedBy: 'citizen-1',
      },
      'officers/off-1': {
        name: 'Officer Vikram',
        department: 'Roads',
        active: true,
        activeComplaints: 2,
        maxCapacity: 5,
        phone: '+91 9876543210',
      },
      'officers/off-busy': {
        name: 'Officer Busy',
        department: 'Roads',
        active: true,
        activeComplaints: 5,
        maxCapacity: 5,
      },
      'officers/off-inactive': {
        name: 'Officer OffDuty',
        department: 'Roads',
        active: false,
        activeComplaints: 0,
        maxCapacity: 5,
      },
    })
  })

  it('successfully dispatches complaint to an eligible officer inside transaction', async () => {
    const res = await dispatchComplaintToOfficer('cmp-101', 'off-1', adminUser)

    expect(res.success).toBe(true)
    expect(res.score).toBeGreaterThan(0)

    // Verify complaint document updates
    const updatedComplaint = runtime.store.read('issues/cmp-101')
    expect(updatedComplaint.status).toBe('In Progress')
    expect(updatedComplaint.assignedOfficerId).toBe('off-1')
    expect(updatedComplaint.assignedWorker.name).toBe('Officer Vikram')
    expect(updatedComplaint.assignedWorker.dispatchedBy).toBe('admin-1')

    // Verify officer workload increment
    const updatedOfficer = runtime.store.read('officers/off-1')
    expect(updatedOfficer.activeComplaints).toBe(3)
    expect(updatedOfficer.activeCount).toBe(3)

    // Verify audit event written
    const events = runtime.store.history
      .filter((h) => h.key.startsWith('issues/cmp-101/events'))
      .map((h) => h.data)

    expect(events).toHaveLength(1)
    expect(events[0].actorUid).toBe('admin-1')
    expect(events[0].eventType).toBe('OFFICER_DISPATCHED')
    expect(events[0].officerId).toBe('off-1')
    expect(events[0].newStatus).toBe('In Progress')

    // Verify citizen notification queued
    const notifications = runtime.store.history
      .filter((h) => h.key.startsWith('notifications/'))
      .map((h) => h.data)

    expect(notifications).toHaveLength(1)
    expect(notifications[0].recipientUid).toBe('citizen-1')
    expect(notifications[0].title).toBe('Officer Dispatched')
  })

  it('rejects dispatch attempt from non-admin user', async () => {
    await expect(
      dispatchComplaintToOfficer('cmp-101', 'off-1', citizenUser)
    ).rejects.toThrow('Only authorized municipal administrators may dispatch complaints')
  })

  it('rejects dispatch when complaint does not exist', async () => {
    await expect(
      dispatchComplaintToOfficer('non-existent', 'off-1', adminUser)
    ).rejects.toThrow('Complaint document does not exist')
  })

  it('rejects dispatch when officer does not exist', async () => {
    await expect(
      dispatchComplaintToOfficer('cmp-101', 'non-existent-officer', adminUser)
    ).rejects.toThrow('Selected officer document does not exist')
  })

  it('rejects dispatch when officer is inactive', async () => {
    await expect(
      dispatchComplaintToOfficer('cmp-101', 'off-inactive', adminUser)
    ).rejects.toThrow('currently inactive')
  })

  it('rejects dispatch when officer has reached maximum capacity', async () => {
    await expect(
      dispatchComplaintToOfficer('cmp-101', 'off-busy', adminUser)
    ).rejects.toThrow('maximum capacity')
  })

  it('rejects dispatch when complaint is in a non-dispatchable status (e.g. Resolved)', async () => {
    runtime.store.write('issues/cmp-101', {
      ...runtime.store.read('issues/cmp-101'),
      status: 'Resolved',
    })

    await expect(
      dispatchComplaintToOfficer('cmp-101', 'off-1', adminUser)
    ).rejects.toThrow('cannot be dispatched')
  })

  it('atomically transfers workload when reassigning between officers', async () => {
    // Initially assign to off-1
    runtime.store.write('issues/cmp-101', {
      ...runtime.store.read('issues/cmp-101'),
      status: 'In Progress',
      assignedOfficerId: 'off-1',
      assignedWorker: { officerId: 'off-1', name: 'Officer Vikram' },
    })
    runtime.store.write('officers/off-2', {
      name: 'Officer Sunita',
      department: 'Roads',
      active: true,
      activeComplaints: 1,
      maxCapacity: 5,
    })

    // Reassign to off-2
    await dispatchComplaintToOfficer('cmp-101', 'off-2', adminUser)

    expect(runtime.store.read('officers/off-1').activeComplaints).toBe(1) // decremented from 2 to 1
    expect(runtime.store.read('officers/off-2').activeComplaints).toBe(2) // incremented from 1 to 2
    expect(runtime.store.read('issues/cmp-101').assignedOfficerId).toBe('off-2')
  })

  it('rolls back all changes without partial updates if transaction fails', async () => {
    runtime.store.failCommit = new Error('Firestore connection lost')

    await expect(
      dispatchComplaintToOfficer('cmp-101', 'off-1', adminUser)
    ).rejects.toThrow('Firestore connection lost')

    // Confirm untouched state
    expect(runtime.store.read('issues/cmp-101').status).toBe('Pending')
    expect(runtime.store.read('officers/off-1').activeComplaints).toBe(2)
  })

  it('prevents over-capacity assignment under concurrent dispatch conflicts', async () => {
    // Officer has 4 active complaints with max 5 (only 1 slot left)
    runtime.store.write('officers/off-race', {
      name: 'Officer Race',
      active: true,
      activeComplaints: 4,
      maxCapacity: 5,
    })
    runtime.store.write('issues/cmp-a', {
      complaintId: 'CMP-A',
      status: 'Pending',
      reportedBy: 'citizen-1',
    })
    runtime.store.write('issues/cmp-b', {
      complaintId: 'CMP-B',
      status: 'Pending',
      reportedBy: 'citizen-2',
    })

    // Simulate two concurrent dispatch attempts competing for the last slot
    let firstCommitDone = false
    runtime.store.beforeCommit = () => {
      if (!firstCommitDone) {
        firstCommitDone = true
        // Mutate officer in the store simulating concurrent assignment
        const current = runtime.store.read('officers/off-race')
        runtime.store.write('officers/off-race', {
          ...current,
          activeComplaints: 5,
          activeCount: 5,
        })
      }
    }

    // Since officer now has 5/5, retry inside transaction will detect capacity reached and reject
    await expect(
      dispatchComplaintToOfficer('cmp-b', 'off-race', adminUser)
    ).rejects.toThrow('maximum capacity')

    expect(runtime.store.read('officers/off-race').activeComplaints).toBe(5)
  })

  describe('Workload Counter Lifecycle Transitions via commitComplaintTransition', () => {
    it('decrements assigned officer activeComplaints when complaint transitions In Progress -> Resolved', async () => {
      runtime.store.write('officers/off-resolved', {
        name: 'Officer Lifecycle',
        activeComplaints: 3,
        activeCount: 3,
      })
      runtime.store.write('issues/cmp-lifecycle-1', {
        status: 'In Progress',
        assignedOfficerId: 'off-resolved',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-lifecycle-1',
        'In Progress',
        { status: 'Resolved' },
        () => null
      )

      expect(runtime.store.read('issues/cmp-lifecycle-1').status).toBe('Resolved')
      expect(runtime.store.read('officers/off-resolved').activeComplaints).toBe(2)
      expect(runtime.store.read('officers/off-resolved').activeCount).toBe(2)
    })

    it('decrements assigned officer activeComplaints when complaint transitions In Progress -> Rejected', async () => {
      runtime.store.write('officers/off-rejected', {
        name: 'Officer Reject',
        activeComplaints: 2,
        activeCount: 2,
      })
      runtime.store.write('issues/cmp-lifecycle-2', {
        status: 'In Progress',
        assignedOfficerId: 'off-rejected',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-lifecycle-2',
        'In Progress',
        { status: 'Rejected' },
        () => null
      )

      expect(runtime.store.read('officers/off-rejected').activeComplaints).toBe(1)
    })

    it('decrements assigned officer activeComplaints when complaint transitions Reopened -> Resolved', async () => {
      runtime.store.write('officers/off-reopened', {
        name: 'Officer Reopened',
        activeComplaints: 1,
        activeCount: 1,
      })
      runtime.store.write('issues/cmp-lifecycle-3', {
        status: 'Reopened',
        assignedOfficerId: 'off-reopened',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-lifecycle-3',
        'Reopened',
        { status: 'Resolved' },
        () => null
      )

      expect(runtime.store.read('officers/off-reopened').activeComplaints).toBe(0)
    })

    it('increments assigned officer activeComplaints when complaint transitions Resolved -> Reopened', async () => {
      runtime.store.write('officers/off-reopen-target', {
        name: 'Officer Target',
        activeComplaints: 2,
        activeCount: 2,
      })
      runtime.store.write('issues/cmp-lifecycle-4', {
        status: 'Resolved',
        assignedOfficerId: 'off-reopen-target',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-lifecycle-4',
        'Resolved',
        { status: 'Reopened' },
        () => null
      )

      expect(runtime.store.read('officers/off-reopen-target').activeComplaints).toBe(3)
    })

    it('does not decrement twice if duplicate terminal transition is attempted', async () => {
      runtime.store.write('officers/off-dup', {
        name: 'Officer Dup',
        activeComplaints: 2,
      })
      runtime.store.write('issues/cmp-dup', {
        status: 'Resolved',
        assignedOfficerId: 'off-dup',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      // Since status is already 'Resolved', expecting 'In Progress' fails transaction
      await expect(
        commitComplaintTransition(
          'cmp-dup',
          'In Progress',
          { status: 'Resolved' },
          () => null
        )
      ).rejects.toThrow('no longer eligible')

      expect(runtime.store.read('officers/off-dup').activeComplaints).toBe(2)
    })

    it('safely processes transition for legacy complaints without assignedOfficerId', async () => {
      runtime.store.write('issues/cmp-legacy', {
        status: 'In Progress',
        assignedWorker: { name: 'Manual Tech', phone: '123' },
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-legacy',
        'In Progress',
        { status: 'Resolved' },
        () => null
      )

      expect(runtime.store.read('issues/cmp-legacy').status).toBe('Resolved')
    })

    it('safely processes transition when officer document is missing or deleted', async () => {
      runtime.store.write('issues/cmp-missing-off', {
        status: 'In Progress',
        assignedOfficerId: 'non-existent-officer',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      await commitComplaintTransition(
        'cmp-missing-off',
        'In Progress',
        { status: 'Resolved' },
        () => null
      )

      expect(runtime.store.read('issues/cmp-missing-off').status).toBe('Resolved')
    })

    it('rolls back completely if transaction fails on write', async () => {
      runtime.store.write('officers/off-rollback', {
        name: 'Officer Rollback',
        activeComplaints: 2,
      })
      runtime.store.write('issues/cmp-rollback', {
        status: 'In Progress',
        assignedOfficerId: 'off-rollback',
      })

      const { commitComplaintTransition } = await import('./complaintLifecycle')

      runtime.store.failCommit = new Error('Database write error')

      await expect(
        commitComplaintTransition(
          'cmp-rollback',
          'In Progress',
          { status: 'Resolved' },
          () => null
        )
      ).rejects.toThrow('Database write error')

      // Complaint status and officer counter must remain unchanged
      expect(runtime.store.read('issues/cmp-rollback').status).toBe('In Progress')
      expect(runtime.store.read('officers/off-rollback').activeComplaints).toBe(2)
      runtime.store.failCommit = null
    })
  })
})
