import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { auth, db } from './services'

export async function endorseComplaint(id, uid) {
  const session = auth.currentUser
  const ref = doc(db, 'issues', id)

  return runTransaction(db, async transaction => {
    if (!session || session.uid !== uid || auth.currentUser !== session) {
      throw new Error('Your sign-in session changed. Please sign in and try again.')
    }
    const snapshot = await transaction.get(ref)
    if (auth.currentUser !== session) throw new Error('Your sign-in session changed. Please sign in and try again.')
    if (!snapshot.exists()) throw new Error('This complaint no longer exists.')

    const current = snapshot.data()
    const endorsers = Array.isArray(current.endorsedBy) ? current.endorsedBy : []
    const count = typeof current.endorsementCount === 'number' && Number.isFinite(current.endorsementCount)
      ? current.endorsementCount : endorsers.length
    if (endorsers.includes(uid)) return { added: false, endorsedBy: endorsers, endorsementCount: count }

    const endorsedBy = [...endorsers, uid]
    const endorsementCount = count + 1
    transaction.update(ref, { endorsedBy, endorsementCount, updatedAt: serverTimestamp() })
    return { added: true, endorsedBy, endorsementCount }
  })
}
