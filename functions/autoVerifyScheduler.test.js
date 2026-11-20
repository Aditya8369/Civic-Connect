import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processExpiredPendingVerifications } from './autoVerifyScheduler.js'

describe('processExpiredPendingVerifications', () => {
  let mockDocs = []
  let transactionUpdates = []
  let transactionSets = []

  const mockDb = {
    collection: vi.fn((colName) => {
      if (colName === 'issues') {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn(async () => ({
            empty: mockDocs.length === 0,
            size: mockDocs.length,
            docs: mockDocs,
          })),
        }
      }
      if (colName === 'notifications') {
        return {
          doc: vi.fn(() => ({
            id: 'mock-notif-id',
            path: 'notifications/mock-notif-id',
          })),
        }
      }
      return {}
    }),
    runTransaction: vi.fn(async (callback) => {
      const mockTransaction = {
        get: vi.fn(async (docRef) => {
          const doc = mockDocs.find((d) => d.id === docRef.id)
          return {
            exists: !!doc,
            id: doc?.id,
            data: () => doc?.data,
          }
        }),
        update: vi.fn((docRef, data) => {
          transactionUpdates.push({ docRef, data })
        }),
        set: vi.fn((docRef, data) => {
          transactionSets.push({ docRef, data })
        }),
      }
      return callback(mockTransaction)
    }),
  }

  beforeEach(() => {
    mockDocs = []
    transactionUpdates = []
    transactionSets = []
    vi.clearAllMocks()
  })

  it('handles empty query gracefully', async () => {
    const result = await processExpiredPendingVerifications(new Date(), mockDb)
    expect(result.processedCount).toBe(0)
    expect(result.autoVerifiedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
  })

  it('auto-verifies an expired Pending Verification complaint', async () => {
    const pastDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    const issueDoc = {
      id: 'issue-1',
      ref: {
        id: 'issue-1',
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ id: 'event-1' })),
        })),
      },
      data: {
        complaintId: 'CMP-101',
        status: 'Pending Verification',
        verificationDeadline: { toMillis: () => pastDate.getTime() },
        reportedBy: 'citizen-123',
      },
    }
    mockDocs = [issueDoc]

    const result = await processExpiredPendingVerifications(new Date(), mockDb)

    expect(result.processedCount).toBe(1)
    expect(result.autoVerifiedCount).toBe(1)
    expect(result.skippedCount).toBe(0)

    // Check transaction update
    expect(transactionUpdates).toHaveLength(1)
    expect(transactionUpdates[0].data.status).toBe('Resolved')
    expect(transactionUpdates[0].data.autoVerified).toBe(true)
    expect(transactionUpdates[0].data.verificationOutcome).toBe('AUTO_VERIFIED')

    // Check transaction audit event and notification
    expect(transactionSets).toHaveLength(2)
    const auditEvent = transactionSets.find((s) => s.data.action === 'Resolution auto-verified')
    expect(auditEvent).toBeDefined()
    expect(auditEvent.data.previousStatus).toBe('Pending Verification')
    expect(auditEvent.data.newStatus).toBe('Resolved')

    const notification = transactionSets.find((s) => s.data.recipientUid === 'citizen-123')
    expect(notification).toBeDefined()
    expect(notification.data.issueId).toBe('CMP-101')
  })

  it('skips a complaint whose status changed to Disputed in the transaction re-check', async () => {
    const pastDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    const issueDoc = {
      id: 'issue-disputed',
      ref: {
        id: 'issue-disputed',
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ id: 'event-2' })),
        })),
      },
      data: {
        complaintId: 'CMP-202',
        status: 'Disputed', // Citizen disputed right as the scheduler ran
        verificationDeadline: { toMillis: () => pastDate.getTime() },
        reportedBy: 'citizen-456',
      },
    }
    mockDocs = [issueDoc]

    const result = await processExpiredPendingVerifications(new Date(), mockDb)

    expect(result.processedCount).toBe(1)
    expect(result.autoVerifiedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(transactionUpdates).toHaveLength(0)
    expect(transactionSets).toHaveLength(0)
  })

  it('skips a complaint whose deadline has not expired yet', async () => {
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    const issueDoc = {
      id: 'issue-future',
      ref: {
        id: 'issue-future',
        collection: vi.fn(() => ({
          doc: vi.fn(() => ({ id: 'event-3' })),
        })),
      },
      data: {
        complaintId: 'CMP-303',
        status: 'Pending Verification',
        verificationDeadline: { toMillis: () => futureDate.getTime() },
        reportedBy: 'citizen-789',
      },
    }
    mockDocs = [issueDoc]

    const result = await processExpiredPendingVerifications(new Date(), mockDb)

    expect(result.processedCount).toBe(1)
    expect(result.autoVerifiedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(transactionUpdates).toHaveLength(0)
  })
})
