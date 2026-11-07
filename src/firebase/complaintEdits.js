import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './services'
import { getComplaintEditError } from '@/utils/complaintEdit'

export class ComplaintEditError extends Error {}

export function saveComplaintEdits(baseline, draft, ownerUid) {
  const ref = doc(db, 'issues', baseline.id)
  // The form validates strings before saving. Trimming both sides keeps a
  // formatting-only edit from rewriting a field from an older snapshot.
  const changes = ['title', 'description', 'address']
    .map(field => [field, draft[field].trim()])
    .filter(([field, value]) => {
      const original = baseline[field]
      return value !== (typeof original === 'string' ? original.trim() : original)
    })

  return runTransaction(db, async transaction => {
    const current = (await transaction.get(ref)).data()
    if (!current) throw new ComplaintEditError('This complaint no longer exists')
    if (!ownerUid || auth.currentUser?.uid !== ownerUid || current.reportedBy !== ownerUid) {
      throw new ComplaintEditError('You can only edit your own complaints')
    }
    if (current.status !== 'Pending') {
      throw new ComplaintEditError('This complaint is no longer Pending and cannot be edited')
    }

    const patch = {}
    for (const [field, value] of changes) {
      if (current[field] === value) continue
      if (current[field] !== baseline[field]) {
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
