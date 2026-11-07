import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './services'
import { getComplaintEditError } from '@/utils/complaintEdit'

export class ComplaintEditError extends Error {}

function normalizedField(value) {
  return typeof value === 'string' ? value.trim() : value
}

export function saveComplaintEdits(baseline, draft, ownerUid) {
  const session = auth.currentUser
  function assertCurrentSession() {
    if (!session || session.uid !== ownerUid || auth.currentUser !== session) {
      throw new ComplaintEditError('Your sign-in session changed. Sign in again and reopen the complaint to edit it.')
    }
  }

  const ref = doc(db, 'issues', baseline.id)
  // The form validates strings before saving. Trimming both sides keeps a
  // formatting-only edit from rewriting a field from an older snapshot.
  const changes = ['title', 'description', 'address']
    .map(field => [field, normalizedField(draft[field])])
    .filter(([field, value]) => value !== normalizedField(baseline[field]))

  return runTransaction(db, async transaction => {
    assertCurrentSession()
    const current = (await transaction.get(ref)).data()
    assertCurrentSession()
    if (!current) throw new ComplaintEditError('This complaint no longer exists')
    if (current.reportedBy !== ownerUid) {
      throw new ComplaintEditError('You can only edit your own complaints')
    }
    if (current.status !== 'Pending') {
      throw new ComplaintEditError('This complaint is no longer Pending and cannot be edited')
    }

    const patch = {}
    for (const [field, value] of changes) {
      const persisted = normalizedField(current[field])
      if (persisted === value) continue
      if (persisted !== normalizedField(baseline[field])) {
        throw new ComplaintEditError(
          `The complaint ${field} changed elsewhere. Copy your draft and reopen the complaint to review the latest details.`,
        )
      }
      patch[field] = value
    }

    const error = getComplaintEditError({ ...current, ...patch })
    if (error) throw new ComplaintEditError(error)
    if (Object.keys(patch).length === 0) return false

    transaction.update(ref, { ...patch, updatedAt: serverTimestamp() })
    return true
  })
}
