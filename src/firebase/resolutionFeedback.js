import { doc, getDocFromServer, runTransaction, serverTimestamp } from 'firebase/firestore'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from './services'
import { validateComplaintAudio, validateComplaintPhoto } from './storage'

export const FEEDBACK_TAGS = ['Quick response', 'Courteous staff', 'Clean finish']
const MAX_VOICE_SIZE_BYTES = 5 * 1024 * 1024

export function assertFeedbackEligible(issue, uid) {
  if (!uid || issue?.reportedBy !== uid) throw new Error('Only the citizen who reported this issue can leave feedback.')
  if (issue.status !== 'Resolved') throw new Error('Feedback is available once the issue is resolved.')
  if (issue.feedback) throw new Error('Feedback has already been submitted.')
}

export async function submitResolutionFeedback(id, { rating, tags, comment, photo, voice }) {
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Sign in to leave feedback.')
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Choose a reaction.')
  if (!Array.isArray(tags) || tags.some((tag) => !FEEDBACK_TAGS.includes(tag)) ||
      new Set(tags).size !== tags.length) throw new Error('Choose valid feedback tags.')
  if (typeof comment !== 'string' || comment.length > 1000) throw new Error('Keep your comment within 1,000 characters.')
  if (photo && voice) throw new Error('Choose one attachment.')
  if (voice?.blob?.size > MAX_VOICE_SIZE_BYTES) {
    throw new Error('Voice notes must be 5 MiB or smaller. Try recording a shorter note.')
  }
  if (globalThis.navigator?.onLine === false) throw new Error('You’re offline. Reconnect and try again.')

  const issueRef = doc(db, 'issues', id)
  let attachment = null
  if (photo || voice) {
    const validation = photo
      ? validateComplaintPhoto(photo)
      : validateComplaintAudio(voice.blob, voice.durationSeconds)
    if (!validation.valid) throw new Error(validation.error)
    assertFeedbackEligible((await getDocFromServer(issueRef)).data(), uid)
    if (auth.currentUser?.uid !== uid) throw new Error('Your sign-in changed. Try again.')
    const file = photo || voice.blob
    const kind = photo ? 'photo' : 'voice'
    const path = `resolution-feedback/${uid}/${id}/${crypto.randomUUID()}`
    await uploadBytes(ref(storage, path), file, { contentType: file.type })
    attachment = { kind, path }
  }

  try {
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(issueRef)
      if (auth.currentUser?.uid !== uid) throw new Error('Your sign-in changed. Try again.')
      assertFeedbackEligible(snapshot.data(), uid)
      transaction.update(issueRef, {
        feedback: { rating, tags, comment: comment.trim(), attachment, submittedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      })
    })
  } catch (error) {
    if (attachment && auth.currentUser?.uid === uid) {
      try {
        // A failed response can follow a successful commit. Confirm against the server.
        const latest = (await getDocFromServer(issueRef)).data()
        if (latest?.reportedBy === uid && latest.feedback?.attachment?.path !== attachment.path &&
            auth.currentUser?.uid === uid) {
          await deleteObject(ref(storage, attachment.path))
        }
      } catch (cleanupError) {
        console.warn('Could not clean up the feedback attachment:', cleanupError)
      }
    }
    throw error
  }
}
