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
 * Resolves a citizen's complaint reference (document ID or tracking ID) to its Firestore document ID.
 *
 * Accepts either:
 * - The Firestore document ID
 * - The public complaint tracking ID (e.g. 'CMP-2026-0001')
 *
 * Supports complaints reported by the authenticated citizen, consolidated tickets
 * where the citizen is a merged reporter, as well as accessible civic complaints.
 */
export async function resolveCitizenComplaintDocumentId(issueId, userId) {
  if (!issueId || !userId) return null

  // 1. First, check whether the supplied reference is already a document ID.
  try {
    const directSnapshot = await getDoc(doc(db, 'issues', issueId))

    if (directSnapshot.exists()) {
      const data = directSnapshot.data() || {}
      const isOwner = data.reportedBy === userId
      const mergedReporters = data.mergedReporters || data.mergedFromUids || []
      const isMergedReporter = Array.isArray(mergedReporters) && mergedReporters.includes(userId)

      if (isOwner || isMergedReporter) {
        return directSnapshot.id
      }

      // Readable civic complaint (e.g. viewed via map pin or duplicate detection)
      return directSnapshot.id
    }
  } catch (error) {
    // A public tracking ID may not be a readable document ID.
    // Continue to the scoped lookups only for permission errors.
    if (error?.code !== 'permission-denied') {
      throw error
    }
  }

  // 2. Resolve tracking ID within current citizen's owned complaints.
  const ownerQuery = query(
    collection(db, 'issues'),
    where('complaintId', '==', issueId),
    where('reportedBy', '==', userId),
    limit(1),
  )

  const ownerSnapshot = await getDocs(ownerQuery)
  if (!ownerSnapshot.empty) {
    return ownerSnapshot.docs[0].id
  }

  // 3. Resolve tracking ID within consolidated tickets where citizen is a merged reporter.
  try {
    const mergedQuery = query(
      collection(db, 'issues'),
      where('complaintId', '==', issueId),
      where('mergedReporters', 'array-contains', userId),
      limit(1),
    )

    const mergedSnapshot = await getDocs(mergedQuery)
    if (!mergedSnapshot.empty) {
      return mergedSnapshot.docs[0].id
    }
  } catch (error) {
    if (error?.code !== 'permission-denied') {
      throw error
    }
  }

  return null
}
