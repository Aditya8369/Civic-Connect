import { getDisplayId } from '@/firebase/complaintId'

export function matchesComplaintSearch(complaint, search, user = {}) {
  const query = search.trim().toLowerCase()

  if (!query) return true

  return (
    getDisplayId(complaint).toLowerCase().includes(query) ||
    (complaint.title || '').toLowerCase().includes(query) ||
    (complaint.category || '').toLowerCase().includes(query) ||
    (complaint.address || '').toLowerCase().includes(query) ||
    (user.name || '').toLowerCase().includes(query) ||
    (user.email || '').toLowerCase().includes(query)
  )
}