
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore'
import { db } from './services'

/**
 * Resolves a citizen's complaint reference to its Firestore document ID.
 *
 * Accepts either:
 * - The Firestore document ID
 * - The public complaint tracking ID
 *
 * Only returns complaints owned by the authenticated citizen.
 */
export async function resolveCitizenComplaintDocumentId(issueId, userId) {
  if (!issueId || !userId) return null

  // First, check whether the supplied reference is already a document ID.
  try {
    const directSnapshot = await getDoc(doc(db, 'issues', issueId))

    if (
        directSnapshot.exists() &&
        directSnapshot.data().reportedBy === userId
    ) {
    return directSnapshot.id
    }
  } catch (error) {
    // A public tracking ID may not be a readable document ID.
    // Continue to the owner-scoped lookup only for permission errors.
    if (error?.code !== 'permission-denied') {
      throw error
    }
  }

  // Resolve the public tracking ID within the current citizen's complaints.
  const ownerQuery = query(
    collection(db, 'issues'),
    where('complaintId', '==', issueId),
    where('reportedBy', '==', userId),
    limit(1),
  )

  const snapshot = await getDocs(ownerQuery)

  return snapshot.empty ? null : snapshot.docs[0].id
}
