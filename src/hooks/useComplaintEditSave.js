import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ComplaintEditError, saveComplaintEdits } from '@/firebase/complaintEdits'
import { getComplaintEditError } from '@/utils/complaintEdit'

function saveErrorMessage(error) {
  if (error instanceof ComplaintEditError) return error.message
  if (error?.code === 'permission-denied') return 'You do not have permission to edit this complaint'
  if (error?.code === 'unavailable' || error?.code === 'deadline-exceeded') {
    return 'Could not connect to save the complaint. Check your connection and try again.'
  }
  return 'Failed to update complaint. Please try again.'
}

export function useComplaintEditSave() {
  const [savingEdit, setSavingEdit] = useState(false)
  const pending = useRef(null)

  useEffect(() => () => { pending.current = null }, [])

  const saveEdit = async (baseline, draft, ownerUid, onSaved) => {
    if (!baseline || pending.current) return
    const error = getComplaintEditError(draft)
    if (error) {
      toast.error(error)
      return
    }

    const operation = Symbol()
    pending.current = operation
    setSavingEdit(true)
    try {
      const updated = await saveComplaintEdits(baseline, draft, ownerUid)
      if (pending.current !== operation) return
      toast.success(updated ? 'Complaint updated successfully' : 'No changes to save')
      onSaved()
    } catch (error) {
      if (pending.current === operation) toast.error(saveErrorMessage(error))
    } finally {
      if (pending.current === operation) {
        pending.current = null
        setSavingEdit(false)
      }
    }
  }

  return { savingEdit, saveEdit }
}
