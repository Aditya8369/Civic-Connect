/**
 * Evidence Retention & Erasure Policy Engine (Issue #283)
 *
 * Implements maintainer-approved data retention schedules, hold-aware cleanup,
 * cleanup intent state machine with partial failure convergence, and non-sensitive
 * UI deletion tombstones for municipal complaint attachments.
 */

import {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  limit as firestoreLimit,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from './services'
import { buildComplaintEvent } from './complaintEvents'

export const DEFAULT_RETENTION_POLICY_VERSION = '2026.1'
export const DEFAULT_RETENTION_DAYS = 90
export const DEFAULT_APPEAL_WINDOW_DAYS = 7

export const ELIGIBLE_CLOSED_STATUSES = Object.freeze([
  'Resolved',
  'Rejected',
  'Merged - Duplicate',
  'Merged',
])

export const INELIGIBLE_ACTIVE_STATUSES = Object.freeze([
  'Pending',
  'In Progress',
  'Reopened',
  'Pending Verification',
  'Disputed',
])

export const CLEANUP_INTENT_STATUS = Object.freeze({
  INTENT_RECORDED: 'INTENT_RECORDED',
  STORAGE_DELETED: 'STORAGE_DELETED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED_CROSS_OWNER: 'SKIPPED_CROSS_OWNER',
  SKIPPED_ALREADY_TOMBSTONED: 'SKIPPED_ALREADY_TOMBSTONED',
})

/**
 * Converts diverse timestamp formats (Firestore Timestamp, Date, number, ISO string)
 * to numeric milliseconds.
 *
 * @param {any} val
 * @returns {number}
 */
export function toTimestampMillis(val) {
  if (!val) return 0
  if (typeof val?.toMillis === 'function') return val.toMillis()
  if (typeof val?.toDate === 'function') {
    const d = val.toDate()
    return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : 0
  }
  if (val instanceof Date) return isNaN(val.getTime()) ? 0 : val.getTime()
  if (typeof val?.seconds === 'number') return val.seconds * 1000
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (typeof val === 'string') {
    const parsed = new Date(val).getTime()
    return isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * Creates a non-sensitive deletion tombstone to replace erased evidence references.
 *
 * @param {object} [options]
 * @returns {object}
 */
export function createEvidenceTombstone({
  path = null,
  reason = 'Municipal data retention policy',
  policyVersion = DEFAULT_RETENTION_POLICY_VERSION,
  erasedAt = null,
} = {}) {
  return {
    tombstone: true,
    erasedAt: erasedAt || new Date().toISOString(),
    reason,
    policyVersion,
    path: path || null,
  }
}

/**
 * Checks whether a given object is an evidence tombstone.
 *
 * @param {any} val
 * @returns {boolean}
 */
export function isEvidenceTombstone(val) {
  return Boolean(val && typeof val === 'object' && val.tombstone === true)
}

/**
 * Extracts the storage path from a string or evidence descriptor object,
 * and validates that it belongs to the target complaint (preventing cross-owner cleanup).
 *
 * @param {string | object} item
 * @param {string | object} complaint
 * @returns {{ storagePath: string | null, rawUrl: string | null, isTombstoned: boolean, isCrossOwner: boolean, isExternal: boolean }}
 */
export function extractEvidencePathInfo(item, complaint) {
  if (!item) {
    return {
      storagePath: null,
      rawUrl: null,
      isTombstoned: false,
      isCrossOwner: false,
      isExternal: false,
    }
  }

  if (isEvidenceTombstone(item)) {
    return {
      storagePath: item.path || null,
      rawUrl: null,
      isTombstoned: true,
      isCrossOwner: false,
      isExternal: false,
    }
  }

  let rawString = null
  if (typeof item === 'string') {
    rawString = item
  } else if (typeof item === 'object') {
    if (item.path) {
      rawString = item.path
    } else if (item.downloadUrl) {
      rawString = item.downloadUrl
    } else if (item.url) {
      rawString = item.url
    }
  }

  if (!rawString) {
    return {
      storagePath: null,
      rawUrl: null,
      isTombstoned: false,
      isCrossOwner: false,
      isExternal: false,
    }
  }

  let storagePath = null
  let isExternal = false

  if (rawString.startsWith('complaint-') || rawString.startsWith('resolution-feedback/')) {
    storagePath = rawString
  } else if (rawString.includes('firebasestorage.googleapis.com')) {
    try {
      const parts = rawString.split('/o/')
      if (parts[1]) {
        const encoded = parts[1].split('?')[0]
        storagePath = decodeURIComponent(encoded)
      }
    } catch {
      storagePath = null
    }
  } else if (
    rawString.startsWith('http://') ||
    rawString.startsWith('https://') ||
    rawString.startsWith('data:') ||
    rawString.startsWith('blob:')
  ) {
    isExternal = true
  } else {
    storagePath = rawString
  }

  // Cross-owner verification
  let isCrossOwner = false
  if (storagePath) {
    const complaintId = typeof complaint === 'string' ? complaint : complaint?.id
    const ticketId = typeof complaint === 'object' ? complaint?.complaintId : null
    const validIds = [complaintId, ticketId].filter(Boolean)

    if (validIds.length > 0) {
      const isOwned = validIds.some((id) => {
        return (
          storagePath.startsWith(`complaint-photos/${id}/`) ||
          storagePath.startsWith(`complaint-audio/${id}/`) ||
          storagePath.startsWith(`complaint-resolution-proof/${id}/`) ||
          storagePath.startsWith(`complaint-disputes/${id}/`) ||
          storagePath.includes(`/${id}/`)
        )
      })
      if (!isOwned) {
        isCrossOwner = true
      }
    }
  }

  return {
    storagePath,
    rawUrl: rawString,
    isTombstoned: false,
    isCrossOwner,
    isExternal,
  }
}

/**
 * Collects all candidate evidence items attached to a complaint record.
 *
 * @param {object} complaint
 * @returns {Array<object>}
 */
export function collectCandidateEvidence(complaint) {
  if (!complaint || typeof complaint !== 'object') return []

  const candidates = []

  // 1. Photos array
  if (Array.isArray(complaint.photos)) {
    complaint.photos.forEach((item, index) => {
      const info = extractEvidencePathInfo(item, complaint)
      candidates.push({
        key: `photos_${index}`,
        field: 'photos',
        index,
        type: 'photo',
        ...info,
      })
    })
  }

  // 2. Legacy imageUrl
  if (complaint.imageUrl) {
    const info = extractEvidencePathInfo(complaint.imageUrl, complaint)
    candidates.push({
      key: 'imageUrl',
      field: 'imageUrl',
      type: 'photo',
      ...info,
    })
  }

  // 3. Audio Note
  if (complaint.audioNote) {
    const info = extractEvidencePathInfo(complaint.audioNote, complaint)
    candidates.push({
      key: 'audioNote',
      field: 'audioNote',
      type: 'audio',
      durationSeconds: complaint.audioNote.durationSeconds || null,
      ...info,
    })
  }

  // 4. Resolution Proof
  if (complaint.resolutionProof) {
    const info = extractEvidencePathInfo(complaint.resolutionProof, complaint)
    candidates.push({
      key: 'resolutionProof',
      field: 'resolutionProof',
      type: 'resolution_proof',
      ...info,
    })
  }

  // 5. Resolution Photos
  if (Array.isArray(complaint.resolutionPhotos)) {
    complaint.resolutionPhotos.forEach((item, index) => {
      const info = extractEvidencePathInfo(item, complaint)
      candidates.push({
        key: `resolutionPhotos_${index}`,
        field: 'resolutionPhotos',
        index,
        type: 'resolution_photo',
        ...info,
      })
    })
  }

  // 6. Citizen Dispute Evidence
  if (Array.isArray(complaint.dispute?.evidence)) {
    complaint.dispute.evidence.forEach((item, index) => {
      const info = extractEvidencePathInfo(item, complaint)
      candidates.push({
        key: `dispute_evidence_${index}`,
        field: 'dispute.evidence',
        index,
        type: 'dispute_evidence',
        ...info,
      })
    })
  }

  return candidates
}

/**
 * Evaluates whether a complaint's evidence is eligible for retention cleanup.
 *
 * Rules:
 * 1. Must be a valid complaint object with an ID.
 * 2. Active complaints (Pending, In Progress, Reopened, Pending Verification, Disputed) are strictly INELIGIBLE.
 * 3. Complaints with active retention holds (complaint.retentionHold?.active === true) are strictly INELIGIBLE.
 * 4. Complaints with active disputes or within citizen appeal window (7 days) are strictly INELIGIBLE.
 * 5. Retention period (default 90 days) must have elapsed since the closed timestamp.
 * 6. Complaint must have unerased evidence attachments.
 *
 * @param {object} complaint
 * @param {object} [options]
 * @returns {object}
 */
export function evaluateEvidenceRetentionEligibility(complaint, options = {}) {
  const now = options.now || Date.now()
  const retentionDays =
    Number(options.retentionDays) > 0 ? Number(options.retentionDays) : DEFAULT_RETENTION_DAYS
  const appealWindowDays =
    Number(options.appealWindowDays) > 0
      ? Number(options.appealWindowDays)
      : DEFAULT_APPEAL_WINDOW_DAYS
  const policyVersion = options.policyVersion || DEFAULT_RETENTION_POLICY_VERSION

  if (!complaint || typeof complaint !== 'object' || !complaint.id) {
    return {
      eligible: false,
      reason: 'Invalid or missing complaint document',
      policyVersion,
      isHeld: false,
      hasActiveAppeal: false,
      candidateEvidence: [],
      retentionExpiresAt: null,
    }
  }

  // Check 1: Active dispute / appeal in progress
  if (complaint.status === 'Disputed' || complaint.dispute?.status === 'ACTIVE') {
    return {
      eligible: false,
      reason: 'Complaint has an active citizen dispute/appeal in review',
      policyVersion,
      isHeld: false,
      hasActiveAppeal: true,
      candidateEvidence: [],
      retentionExpiresAt: null,
    }
  }

  // Check 2: Active complaints
  const status = complaint.status
  if (INELIGIBLE_ACTIVE_STATUSES.includes(status) || !ELIGIBLE_CLOSED_STATUSES.includes(status)) {
    return {
      eligible: false,
      reason: `Complaint is currently active with status "${status}"`,
      policyVersion,
      isHeld: false,
      hasActiveAppeal: false,
      candidateEvidence: [],
      retentionExpiresAt: null,
    }
  }

  // Check 3: Active retention hold
  if (complaint.retentionHold?.active === true) {
    const holdReason = complaint.retentionHold.reason || 'Legal or administrative hold'
    return {
      eligible: false,
      reason: `Complaint is subject to active retention hold: "${holdReason}"`,
      policyVersion,
      isHeld: true,
      hasActiveAppeal: false,
      candidateEvidence: [],
      retentionExpiresAt: null,
    }
  }

  // Check 4: Citizen appeal window for Resolved complaints
  if (status === 'Resolved') {
    const resolvedMs = toTimestampMillis(
      complaint.resolvedAt ||
        complaint.acceptedAt ||
        complaint.verificationDeadline ||
        complaint.updatedAt
    )
    const appealWindowMs = appealWindowDays * 24 * 60 * 60 * 1000
    if (resolvedMs > 0 && now < resolvedMs + appealWindowMs) {
      const appealExpiresAt = resolvedMs + appealWindowMs
      return {
        eligible: false,
        reason: `Complaint is within the ${appealWindowDays}-day citizen appeal window (open until ${new Date(appealExpiresAt).toISOString()})`,
        policyVersion,
        isHeld: false,
        hasActiveAppeal: true,
        candidateEvidence: [],
        retentionExpiresAt: null,
      }
    }
  }

  // Check 5: Retention period elapsed
  const closedMs = toTimestampMillis(
    complaint.resolvedAt ||
      complaint.rejectedAt ||
      complaint.mergedAt ||
      complaint.closedAt ||
      complaint.updatedAt ||
      complaint.createdAt
  )
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const retentionExpiresAt = closedMs + retentionMs

  if (now < retentionExpiresAt) {
    return {
      eligible: false,
      reason: `Retention period (${retentionDays} days) has not elapsed yet. Eligible at ${new Date(retentionExpiresAt).toISOString()}`,
      policyVersion,
      isHeld: false,
      hasActiveAppeal: false,
      candidateEvidence: [],
      retentionExpiresAt,
    }
  }

  // Check 6: Candidate evidence presence
  const candidateEvidence = collectCandidateEvidence(complaint)
  const unerased = candidateEvidence.filter((c) => !c.isTombstoned)

  if (unerased.length === 0) {
    return {
      eligible: false,
      reason: 'No active or unerased evidence attachments found on this complaint',
      policyVersion,
      isHeld: false,
      hasActiveAppeal: false,
      candidateEvidence,
      retentionExpiresAt,
    }
  }

  return {
    eligible: true,
    reason: 'Complaint retention period elapsed and all hold/appeal requirements met',
    policyVersion,
    isHeld: false,
    hasActiveAppeal: false,
    candidateEvidence: unerased,
    retentionExpiresAt,
  }
}

/**
 * Applies an administrative or legal retention hold to a complaint.
 *
 * @param {string} complaintId
 * @param {{ reason: string, holdId?: string, notes?: string }} holdData
 * @param {{ uid: string, email?: string }} adminUser
 * @param {{ customDb?: object }} [options]
 * @returns {Promise<object>}
 */
export async function applyRetentionHold(
  complaintId,
  { reason, holdId, notes } = {},
  adminUser,
  { customDb = db } = {}
) {
  if (!complaintId) throw new Error('A valid complaint ID is required to apply retention hold.')
  if (!reason || !reason.trim()) {
    throw new Error('A justification reason is required to apply a retention hold.')
  }
  if (!adminUser?.uid) throw new Error('Admin authentication is required to apply a retention hold.')

  const refDoc = doc(customDb, 'issues', complaintId)

  return await runTransaction(customDb, async (transaction) => {
    const snap = await transaction.get(refDoc)
    if (!snap.exists()) {
      throw new Error(`Complaint ${complaintId} not found`)
    }
    const current = snap.data()
    const holdPayload = {
      active: true,
      holdId: holdId || `HOLD-${Date.now()}`,
      reason: reason.trim(),
      notes: notes?.trim() || null,
      appliedAt: serverTimestamp(),
      heldBy: adminUser.uid,
      heldByEmail: adminUser.email || null,
    }

    transaction.update(refDoc, {
      retentionHold: holdPayload,
      updatedAt: serverTimestamp(),
    })

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    const eventData = buildComplaintEvent({
      action: 'Retention hold applied',
      actorUid: adminUser.uid,
      timestamp: serverTimestamp(),
      previousStatus: current.status || null,
      newStatus: current.status || null,
      remarks: `Retention hold applied: ${reason.trim()}`,
    })
    transaction.set(eventRef, eventData)

    return { success: true, complaintId, hold: holdPayload }
  })
}

/**
 * Releases an active retention hold from a complaint.
 *
 * @param {string} complaintId
 * @param {{ reason: string, notes?: string }} releaseData
 * @param {{ uid: string, email?: string }} adminUser
 * @param {{ customDb?: object }} [options]
 * @returns {Promise<object>}
 */
export async function releaseRetentionHold(
  complaintId,
  { reason, notes } = {},
  adminUser,
  { customDb = db } = {}
) {
  if (!complaintId) throw new Error('A valid complaint ID is required to release retention hold.')
  if (!reason || !reason.trim()) {
    throw new Error('A release reason is required to release a retention hold.')
  }
  if (!adminUser?.uid) throw new Error('Admin authentication is required to release a retention hold.')

  const refDoc = doc(customDb, 'issues', complaintId)

  return await runTransaction(customDb, async (transaction) => {
    const snap = await transaction.get(refDoc)
    if (!snap.exists()) {
      throw new Error(`Complaint ${complaintId} not found`)
    }
    const current = snap.data()
    if (current.retentionHold?.active !== true) {
      throw new Error(`Complaint ${complaintId} does not have an active retention hold.`)
    }

    const releasedHoldPayload = {
      ...current.retentionHold,
      active: false,
      releasedAt: serverTimestamp(),
      releasedBy: adminUser.uid,
      releasedByEmail: adminUser.email || null,
      releaseReason: reason.trim(),
      releaseNotes: notes?.trim() || null,
    }

    transaction.update(refDoc, {
      retentionHold: releasedHoldPayload,
      updatedAt: serverTimestamp(),
    })

    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    const eventData = buildComplaintEvent({
      action: 'Retention hold released',
      actorUid: adminUser.uid,
      timestamp: serverTimestamp(),
      previousStatus: current.status || null,
      newStatus: current.status || null,
      remarks: `Retention hold released: ${reason.trim()}`,
    })
    transaction.set(eventRef, eventData)

    return { success: true, complaintId, hold: releasedHoldPayload }
  })
}

/**
 * Safely deletes a file from Firebase Cloud Storage by path.
 * Idempotent: returns true if deleted or already missing (404 / object-not-found).
 *
 * @param {string} storagePath
 * @param {object} customStorage
 * @returns {Promise<boolean>}
 */
async function safeDeleteStorageFile(storagePath, customStorage = storage) {
  if (!storagePath) return false
  try {
    const fileRef = ref(customStorage, storagePath)
    await deleteObject(fileRef)
    return true
  } catch (err) {
    const code = err?.code || ''
    // If object was already deleted in a prior attempt, converge idempotently
    if (
      code === 'storage/object-not-found' ||
      err?.message?.includes('does not exist') ||
      err?.message?.includes('not found')
    ) {
      return true
    }
    throw err
  }
}

/**
 * Executes the evidence retention erasure workflow for a complaint.
 *
 * Supports:
 * - dryRun mode (evaluates eligibility and candidate evidence without modifications).
 * - Intent state machine: marks INTENT_RECORDED, deletes storage object, marks STORAGE_DELETED,
 *   replaces Firestore references with non-sensitive deletion tombstones, and marks COMPLETED.
 * - Cross-complaint ownership guard: refuses to delete storage paths from other complaints.
 * - Idempotency and partial failure convergence.
 * - Audit logging with minimal action metadata (no sensitive erased media in audit records).
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function executeEvidenceRetentionCleanup({
  complaintId,
  dryRun = false,
  force = false,
  retentionDays = DEFAULT_RETENTION_DAYS,
  policyVersion = DEFAULT_RETENTION_POLICY_VERSION,
  customDb = db,
  customStorage = storage,
  adminUser = { uid: 'system_retention_worker' },
  now = Date.now(),
} = {}) {
  if (!complaintId) throw new Error('A complaint ID is required for retention cleanup.')

  const complaintRef = doc(customDb, 'issues', complaintId)
  const snap = await getDoc(complaintRef)

  if (!snap.exists()) {
    throw new Error(`Complaint ${complaintId} not found`)
  }

  const complaint = { id: snap.id, ...snap.data() }

  // 1. Evaluate eligibility
  const eligibility = evaluateEvidenceRetentionEligibility(complaint, {
    now,
    retentionDays,
    policyVersion,
  })

  if (dryRun) {
    return {
      dryRun: true,
      complaintId,
      eligible: eligibility.eligible,
      reason: eligibility.reason,
      policyVersion,
      retentionExpiresAt: eligibility.retentionExpiresAt,
      candidateEvidence: eligibility.candidateEvidence,
    }
  }

  if (!eligibility.eligible && !force) {
    return {
      success: false,
      complaintId,
      eligible: false,
      reason: eligibility.reason,
      skipped: true,
      candidateEvidence: eligibility.candidateEvidence,
    }
  }

  const candidates = eligibility.candidateEvidence
  const intents = { ...(complaint.retentionCleanupIntents || {}) }
  const errors = []
  let erasedCount = 0

  // 2. Process Storage deletions and update intents
  for (const candidate of candidates) {
    const intentKey = candidate.key
    const existingIntent = intents[intentKey]

    if (existingIntent?.status === CLEANUP_INTENT_STATUS.COMPLETED) {
      continue
    }

    // Cross-owner safety guard: skip Storage deletion if the path belongs to another complaint
    if (candidate.isCrossOwner) {
      intents[intentKey] = {
        status: CLEANUP_INTENT_STATUS.SKIPPED_CROSS_OWNER,
        reason: 'Storage path does not match complaint ID; skipped for tenant isolation safety',
        storagePath: candidate.storagePath,
        updatedAt: now,
      }
      continue
    }

    // Step 2a: Record cleanup intent
    intents[intentKey] = {
      status: CLEANUP_INTENT_STATUS.INTENT_RECORDED,
      storagePath: candidate.storagePath,
      field: candidate.field,
      index: candidate.index ?? null,
      policyVersion,
      recordedAt: now,
    }

    // Step 2b: Delete from Firebase Cloud Storage (if not external URL)
    if (candidate.storagePath && !candidate.isExternal) {
      try {
        await safeDeleteStorageFile(candidate.storagePath, customStorage)
        intents[intentKey].status = CLEANUP_INTENT_STATUS.STORAGE_DELETED
        intents[intentKey].storageDeletedAt = now
      } catch (err) {
        intents[intentKey].status = CLEANUP_INTENT_STATUS.FAILED
        intents[intentKey].error = err.message
        errors.push({ key: intentKey, error: err.message })
        continue
      }
    } else {
      // External or mock URLs do not have real Storage objects
      intents[intentKey].status = CLEANUP_INTENT_STATUS.STORAGE_DELETED
    }

    erasedCount++
  }

  // 3. Atomically replace Firestore references with non-sensitive tombstones
  const updatePayload = {
    retentionCleanupIntents: intents,
    updatedAt: serverTimestamp(),
  }

  // Tombstone photos
  if (Array.isArray(complaint.photos) && complaint.photos.length > 0) {
    updatePayload.photos = complaint.photos.map((item, idx) => {
      const intentKey = `photos_${idx}`
      const intent = intents[intentKey]
      if (
        intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
        intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
      ) {
        intents[intentKey].status = CLEANUP_INTENT_STATUS.COMPLETED
        intents[intentKey].completedAt = now
        return createEvidenceTombstone({
          path: intent.storagePath,
          policyVersion,
        })
      }
      return item
    })
  }

  // Tombstone imageUrl
  if (complaint.imageUrl) {
    const intent = intents.imageUrl
    if (
      intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
      intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
    ) {
      intents.imageUrl.status = CLEANUP_INTENT_STATUS.COMPLETED
      intents.imageUrl.completedAt = now
      updatePayload.imageUrl = null
      updatePayload.imageTombstone = createEvidenceTombstone({
        path: intent.storagePath,
        policyVersion,
      })
    }
  }

  // Tombstone audioNote
  if (complaint.audioNote) {
    const intent = intents.audioNote
    if (
      intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
      intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
    ) {
      intents.audioNote.status = CLEANUP_INTENT_STATUS.COMPLETED
      intents.audioNote.completedAt = now
      updatePayload.audioNote = {
        ...createEvidenceTombstone({
          path: intent.storagePath,
          policyVersion,
        }),
        durationSeconds: complaint.audioNote.durationSeconds || null,
      }
    }
  }

  // Tombstone resolutionProof
  if (complaint.resolutionProof) {
    const intent = intents.resolutionProof
    if (
      intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
      intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
    ) {
      intents.resolutionProof.status = CLEANUP_INTENT_STATUS.COMPLETED
      intents.resolutionProof.completedAt = now
      updatePayload.resolutionProof = createEvidenceTombstone({
        path: intent.storagePath,
        policyVersion,
      })
    }
  }

  // Tombstone resolutionPhotos
  if (Array.isArray(complaint.resolutionPhotos) && complaint.resolutionPhotos.length > 0) {
    updatePayload.resolutionPhotos = complaint.resolutionPhotos.map((item, idx) => {
      const intentKey = `resolutionPhotos_${idx}`
      const intent = intents[intentKey]
      if (
        intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
        intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
      ) {
        intents[intentKey].status = CLEANUP_INTENT_STATUS.COMPLETED
        intents[intentKey].completedAt = now
        return createEvidenceTombstone({
          path: intent.storagePath,
          policyVersion,
        })
      }
      return item
    })
  }

  // Tombstone dispute evidence
  if (Array.isArray(complaint.dispute?.evidence) && complaint.dispute.evidence.length > 0) {
    const updatedDisputeEvidence = complaint.dispute.evidence.map((item, idx) => {
      const intentKey = `dispute_evidence_${idx}`
      const intent = intents[intentKey]
      if (
        intent?.status === CLEANUP_INTENT_STATUS.STORAGE_DELETED ||
        intent?.status === CLEANUP_INTENT_STATUS.COMPLETED
      ) {
        intents[intentKey].status = CLEANUP_INTENT_STATUS.COMPLETED
        intents[intentKey].completedAt = now
        return createEvidenceTombstone({
          path: intent.storagePath,
          policyVersion,
        })
      }
      return item
    })
    updatePayload['dispute.evidence'] = updatedDisputeEvidence
  }

  updatePayload.evidenceErased = true
  updatePayload.evidenceErasedAt = serverTimestamp()
  updatePayload.retentionPolicyVersion = policyVersion

  // Commit updates and audit trail in a transaction
  await runTransaction(customDb, async (transaction) => {
    transaction.update(complaintRef, updatePayload)

    // Audit record: immutable, minimal metadata only (NEVER copy erased URLs/media into audit log)
    const eventRef = doc(collection(customDb, `issues/${complaintId}/events`))
    const eventData = buildComplaintEvent({
      action: 'Evidence retention erasure',
      actorUid: adminUser?.uid || 'system_retention_worker',
      timestamp: serverTimestamp(),
      previousStatus: complaint.status || null,
      newStatus: complaint.status || null,
      remarks: `Erased ${erasedCount} evidence file(s) under municipal retention policy v${policyVersion} (${retentionDays}d schedule)`,
    })
    transaction.set(eventRef, eventData)
  })

  return {
    success: errors.length === 0,
    complaintId,
    erasedCount,
    policyVersion,
    intents,
    errors,
  }
}

/**
 * Sweeps closed complaints and runs retention cleanup or dry-run inspection.
 *
 * @param {object} params
 * @returns {Promise<object>}
 */
export async function runRetentionCleanupSweep({
  dryRun = true,
  retentionDays = DEFAULT_RETENTION_DAYS,
  policyVersion = DEFAULT_RETENTION_POLICY_VERSION,
  limitCount = 50,
  customDb = db,
  customStorage = storage,
  adminUser = { uid: 'system_retention_worker' },
  now = Date.now(),
} = {}) {
  const issuesCol = collection(customDb, 'issues')
  const q = query(
    issuesCol,
    where('status', 'in', ['Resolved', 'Rejected', 'Merged - Duplicate']),
    firestoreLimit(limitCount)
  )

  const snap = await getDocs(q)
  const results = []

  for (const docSnap of snap.docs) {
    const complaint = { id: docSnap.id, ...docSnap.data() }
    const res = await executeEvidenceRetentionCleanup({
      complaintId: complaint.id,
      dryRun,
      retentionDays,
      policyVersion,
      customDb,
      customStorage,
      adminUser,
      now,
    })
    results.push(res)
  }

  const eligibleCount = results.filter((r) => (dryRun ? r.eligible : r.success)).length

  return {
    dryRun,
    totalInspected: results.length,
    eligibleCount,
    results,
  }
}
