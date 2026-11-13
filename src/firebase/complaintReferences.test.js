
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveCitizenComplaintDocumentId } from './complaintReferences'

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}))

vi.mock('./services', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ type: 'collection', name }),
  doc: (_db, ...parts) => ({ type: 'doc', path: parts.join('/') }),
  getDoc: (...args) => firestore.getDoc(...args),
  getDocs: (...args) => firestore.getDocs(...args),
  limit: (count) => ({ type: 'limit', count }),
  query: (ref, ...constraints) => ({ ref, constraints }),
  where: (field, operator, value) => ({ field, operator, value }),
}))

const ownedComplaint = {
  exists: () => true,
  id: 'firestore-doc-123',
  data: () => ({
    reportedBy: 'citizen-1',
    complaintId: 'CMP-2026-0001',
  }),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveCitizenComplaintDocumentId', () => {
  it('returns the document ID when the citizen supplies a document ID', async () => {
    firestore.getDoc.mockResolvedValue(ownedComplaint)

    await expect(
      resolveCitizenComplaintDocumentId('firestore-doc-123', 'citizen-1'),
    ).resolves.toBe('firestore-doc-123')

    expect(firestore.getDocs).not.toHaveBeenCalled()
  })

  it('resolves a public tracking ID using an owner-scoped query', async () => {
    firestore.getDoc.mockRejectedValue({ code: 'permission-denied' })
    firestore.getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'firestore-doc-123' }],
    })

    await expect(
      resolveCitizenComplaintDocumentId('CMP-2026-0001', 'citizen-1'),
    ).resolves.toBe('firestore-doc-123')

    const ownerQuery = firestore.getDocs.mock.calls[0][0]

    expect(ownerQuery.constraints).toContainEqual({
      field: 'complaintId',
      operator: '==',
      value: 'CMP-2026-0001',
    })

    expect(ownerQuery.constraints).toContainEqual({
      field: 'reportedBy',
      operator: '==',
      value: 'citizen-1',
    })
  })

  it('does not resolve another citizen complaint', async () => {
    firestore.getDoc.mockRejectedValue({ code: 'permission-denied' })
    firestore.getDocs.mockResolvedValue({
      empty: true,
      docs: [],
    })

    await expect(
      resolveCitizenComplaintDocumentId('CMP-2026-0001', 'citizen-2'),
    ).resolves.toBeNull()
  })

  it('returns null for an unknown tracking ID', async () => {
    firestore.getDoc.mockResolvedValue({
      exists: () => false,
    })
    firestore.getDocs.mockResolvedValue({
      empty: true,
      docs: [],
    })

    await expect(
      resolveCitizenComplaintDocumentId('UNKNOWN-ID', 'citizen-1'),
    ).resolves.toBeNull()
  })

  it('does not hide genuine network errors', async () => {
    firestore.getDoc.mockRejectedValue({ code: 'unavailable' })

    await expect(
      resolveCitizenComplaintDocumentId('CMP-2026-0001', 'citizen-1'),
    ).rejects.toMatchObject({ code: 'unavailable' })

    expect(firestore.getDocs).not.toHaveBeenCalled()
  })

  it('returns null when the required reference or user ID is missing', async () => {
    await expect(
      resolveCitizenComplaintDocumentId('', 'citizen-1'),
    ).resolves.toBeNull()

    await expect(
      resolveCitizenComplaintDocumentId('CMP-2026-0001', ''),
    ).resolves.toBeNull()

    expect(firestore.getDoc).not.toHaveBeenCalled()
  })
})
