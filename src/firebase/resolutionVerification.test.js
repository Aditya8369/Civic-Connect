import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  submitResolutionForVerification,
  acceptComplaintResolution,
  disputeComplaintResolution,
  reviewComplaintDispute,
  autoVerifyExpiredComplaint,
} from './complaintLifecycle'

const mocks = vi.hoisted(() => ({
  auth: { currentUser: { uid: 'citizen-1' } },
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  collection: vi.fn((_, path) => path),
  doc: vi.fn((_, col, id) => (id ? `${col}/${id}` : `${col}/auto-event-id`)),
  serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  Timestamp: {
    fromMillis: (ms) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms),
    }),
    now: () => ({
      toMillis: () => Date.now(),
      toDate: () => new Date(),
    }),
  },
}))

vi.mock('./services', () => ({
  db: {},
  auth: mocks.auth,
}))

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  collection: mocks.collection,
  runTransaction: (db, callback) => mocks.runTransaction(db, callback),
  serverTimestamp: mocks.serverTimestamp,
  Timestamp: mocks.Timestamp,
}))

vi.mock('./notifications', () => ({
  addNotificationToBatch: vi.fn(),
}))

vi.mock('./complaintEvents', () => ({
  buildComplaintEvent: (data) => ({ ...data, eventTimestamp: 'mock-timestamp' }),
}))

describe('Two-Stage Resolution Verification & Dispute Lifecycle (#253)', () => {
  const baseComplaint = {
    title: 'Broken streetlight on 5th Ave',
    status: 'In Progress',
    reportedBy: 'citizen-1',
    department: 'Electricity',
    assignedOfficerId: 'officer-42',
    complaintId: 'CMP-2026-0099',
    createdAt: mocks.Timestamp.fromMillis(Date.now() - 100000),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runTransaction.mockImplementation(async (_, callback) => {
      const transaction = {
        get: mocks.get,
        set: mocks.set,
        update: mocks.update,
      }
      return callback(transaction)
    })
  })

  describe('submitResolutionForVerification', () => {
    const validProof = {
      downloadUrl: 'https://firebasestorage.googleapis.com/.../proof.jpg',
      path: 'complaint-resolution-proof/issue-1/proof.jpg',
      filename: 'proof.jpg',
      contentType: 'image/jpeg',
      size: 1024 * 500,
    }

    it('successfully transitions from In Progress to Pending Verification with 5-day deadline', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...baseComplaint }),
      })

      const result = await submitResolutionForVerification(
        'issue-1',
        {
          resolutionNotes: 'Repaired bulb and replaced fixture fuse.',
          resolutionProof: validProof,
        },
        { uid: 'admin-1', role: 'admin' }
      )

      expect(result.status).toBe('Pending Verification')
      expect(result.resolutionProof).toEqual(
        expect.objectContaining({
          downloadUrl: validProof.downloadUrl,
          path: validProof.path,
        })
      )
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'Pending Verification',
          resolutionNotes: 'Repaired bulb and replaced fixture fuse.',
          resolutionPhotos: [validProof.downloadUrl],
        })
      )
      expect(mocks.set).toHaveBeenCalled() // Audit event written
    })

    it('rejects submission when complaint status is not active (e.g. Resolved)', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...baseComplaint, status: 'Resolved' }),
      })

      await expect(
        submitResolutionForVerification(
          'issue-1',
          { resolutionNotes: 'Notes', resolutionProof: validProof },
          { uid: 'admin-1', role: 'admin' }
        )
      ).rejects.toThrow('Complaint with status "Resolved" cannot be submitted for verification')
    })

    it('rejects submission when resolution notes are empty or missing', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...baseComplaint }),
      })

      await expect(
        submitResolutionForVerification(
          'issue-1',
          { resolutionNotes: '', resolutionProof: validProof },
          { uid: 'admin-1', role: 'admin' }
        )
      ).rejects.toThrow('Resolution completion notes are required')
    })

    it('rejects submission when proof artifact has invalid storage path format', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...baseComplaint }),
      })

      await expect(
        submitResolutionForVerification(
          'issue-1',
          {
            resolutionNotes: 'Done',
            resolutionProof: { ...validProof, path: 'arbitrary-folder/proof.jpg' },
          },
          { uid: 'admin-1', role: 'admin' }
        )
      ).rejects.toThrow('complaint-resolution-proof')
    })
  })

  describe('acceptComplaintResolution', () => {
    it('allows complaint reporter to accept resolution within deadline and marks status Resolved', async () => {
      const pendingComplaint = {
        ...baseComplaint,
        status: 'Pending Verification',
        verificationDeadline: mocks.Timestamp.fromMillis(Date.now() + 86400000), // 1 day future
        resolutionProof: { downloadUrl: 'https://...' },
      }

      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => pendingComplaint,
      })

      const res = await acceptComplaintResolution(
        'issue-1',
        { uid: 'citizen-1', role: 'citizen' },
        { rating: 5, comment: 'Great rapid work!' }
      )

      expect(res.status).toBe('Resolved')
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'Resolved',
          acceptedBy: 'citizen-1',
          resolvedAt: expect.anything(),
        })
      )
    })

    it('rejects acceptance if caller is not the complaint reporter', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(Date.now() + 86400000),
        }),
      })

      await expect(
        acceptComplaintResolution(
          'issue-1',
          { uid: 'other-citizen', role: 'citizen' },
          {}
        )
      ).rejects.toThrow('Only the citizen who reported')
    })

    it('rejects acceptance if the 5-day verification deadline has already passed', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(Date.now() - 1000), // Past
        }),
      })

      await expect(
        acceptComplaintResolution(
          'issue-1',
          { uid: 'citizen-1', role: 'citizen' },
          {}
        )
      ).rejects.toThrow('5-day review period for this resolution has expired')
    })
  })

  describe('disputeComplaintResolution', () => {
    const validDisputeEvidence = [
      {
        downloadUrl: 'https://...',
        path: 'complaint-disputes/issue-1/photo.jpg',
        contentType: 'image/jpeg',
      },
    ]

    it('allows complaint reporter to dispute resolution with structured reasons', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(Date.now() + 86400000),
        }),
      })

      const res = await disputeComplaintResolution(
        'issue-1',
        {
          reason: 'WORK_INCOMPLETE',
          explanation: 'Only one street lamp was replaced; three others remain pitch dark.',
          evidence: validDisputeEvidence,
        },
        { uid: 'citizen-1', role: 'citizen' }
      )

      expect(res.status).toBe('Disputed')
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'Disputed',
          dispute: expect.objectContaining({
            reason: 'WORK_INCOMPLETE',
            explanation: expect.stringContaining('three others remain pitch dark'),
            disputedBy: 'citizen-1',
          }),
        })
      )
    })

    it('rejects dispute if an invalid dispute reason code is provided', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(Date.now() + 86400000),
        }),
      })

      await expect(
        disputeComplaintResolution(
          'issue-1',
          {
            reason: 'INVALID_CATEGORY',
            explanation: 'Some explanation',
            evidence: validDisputeEvidence,
          },
          { uid: 'citizen-1', role: 'citizen' }
        )
      ).rejects.toThrow('valid dispute reason category')
    })

    it('rejects dispute if explanation is blank or whitespace', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(Date.now() + 86400000),
        }),
      })

      await expect(
        disputeComplaintResolution(
          'issue-1',
          {
            reason: 'WORK_INCOMPLETE',
            explanation: '   ',
            evidence: validDisputeEvidence,
          },
          { uid: 'citizen-1', role: 'citizen' }
        )
      ).rejects.toThrow('detailed dispute explanation is required')
    })

    it('prevents duplicate disputes once already Disputed', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Disputed',
        }),
      })

      await expect(
        disputeComplaintResolution(
          'issue-1',
          {
            reason: 'WORK_INCOMPLETE',
            explanation: 'Valid explanation',
            evidence: validDisputeEvidence,
          },
          { uid: 'citizen-1', role: 'citizen' }
        )
      ).rejects.toThrow('Complaint is not pending verification')
    })
  })

  describe('reviewComplaintDispute', () => {
    const disputedComplaint = {
      ...baseComplaint,
      status: 'Disputed',
      dispute: {
        reason: 'WORK_INCOMPLETE',
        explanation: 'Streetlight still flickering',
      },
    }

    it('upholds dispute: returns ticket to In Progress for field rework', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...disputedComplaint }),
      })

      const res = await reviewComplaintDispute(
        'issue-1',
        {
          outcome: 'UPHOLD_DISPUTE',
          remarks: 'Inspected on-site. Field crew must re-wire connection box.',
        },
        { uid: 'admin-super', role: 'admin' }
      )

      expect(res.status).toBe('In Progress')
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'In Progress',
          disputeReview: expect.objectContaining({
            outcome: 'UPHOLD_DISPUTE',
            reviewedBy: 'admin-super',
          }),
        })
      )
    })

    it('rejects dispute: overrules citizen and confirms permanent Resolved status', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...disputedComplaint }),
      })

      const res = await reviewComplaintDispute(
        'issue-1',
        {
          outcome: 'REJECT_DISPUTE',
          remarks: 'Confirmed lamp is operational as per municipal lux standards.',
        },
        { uid: 'admin-super', role: 'admin' }
      )

      expect(res.status).toBe('Resolved')
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'Resolved',
          disputeReview: expect.objectContaining({
            outcome: 'REJECT_DISPUTE',
            reviewedBy: 'admin-super',
          }),
          resolvedAt: expect.anything(),
        })
      )
    })

    it('requires admin authorization for dispute review', async () => {
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({ ...disputedComplaint }),
      })

      await expect(
        reviewComplaintDispute(
          'issue-1',
          { outcome: 'UPHOLD_DISPUTE', remarks: 'Remarks' },
          { uid: 'citizen-1', role: 'citizen' }
        )
      ).rejects.toThrow('Only authorized municipal administrators may review disputes')
    })
  })

  describe('autoVerifyExpiredComplaint', () => {
    it('atomically resolves a complaint whose 5-day review deadline has passed', async () => {
      const expiredTime = Date.now() - 5000
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(expiredTime),
          resolutionProof: { downloadUrl: 'https://...' },
        }),
      })

      const res = await autoVerifyExpiredComplaint('issue-1', Date.now())
      expect(res.autoVerified).toBe(true)
      expect(res.status).toBe('Resolved')
      expect(mocks.update).toHaveBeenCalledWith(
        'issues/issue-1',
        expect.objectContaining({
          status: 'Resolved',
          autoVerified: true,
        })
      )
    })

    it('refuses to auto-verify if the deadline has not elapsed yet', async () => {
      const futureTime = Date.now() + 86400000
      mocks.get.mockResolvedValue({
        exists: () => true,
        data: () => ({
          ...baseComplaint,
          status: 'Pending Verification',
          verificationDeadline: mocks.Timestamp.fromMillis(futureTime),
        }),
      })

      const res = await autoVerifyExpiredComplaint('issue-1', Date.now())
      expect(res.skipped).toBe(true)
      expect(mocks.update).not.toHaveBeenCalled()
    })
  })
})
