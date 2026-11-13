import { getDisplayId } from '@/firebase/complaintId'

export const SPOTLIGHT_CATEGORIES = [
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

export const SPOTLIGHT_PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

export const SPOTLIGHT_STATUSES = [
  'Pending',
  'In Progress',
  'Resolved',
  'Rejected',
  'Reopened',
]

export const DEFAULT_MUNICIPAL_WARDS = [
  'Ward 1',
  'Ward 2',
  'Ward 3',
  'Ward 4',
  'Ward 5',
  'Ward 6',
  'Ward 7',
  'Ward 8',
  'Ward 9',
  'Ward 10',
  'Ward 11',
  'Ward 12',
]

/**
 * Extracts all unique wards from reports data, falling back to standard wards if none are found.
 * @param {Array} reports
 * @returns {string[]}
 */
export function extractAvailableWards(reports = []) {
  const wards = new Set()

  reports.forEach((report) => {
    if (!report) return

    if (report.ward && typeof report.ward === 'string' && report.ward.trim()) {
      wards.add(report.ward.trim())
    }

    // Inspect address and location fields for ward references like "Ward 4" or "Ward-12"
    const locationStr = `${report.address || ''} ${report.location || ''}`
    const match = locationStr.match(/Ward[-\s]*\d+/gi)
    if (match) {
      match.forEach((m) => {
        // Standardize format: "Ward X"
        const num = m.replace(/Ward[-\s]*/i, '').trim()
        wards.add(`Ward ${num}`)
      })
    }
  })

  if (wards.size === 0) {
    return [...DEFAULT_MUNICIPAL_WARDS]
  }

  // Include any default wards that might be useful or return discovered wards sorted
  return Array.from(wards).sort((a, b) => {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  })
}

/**
 * Normalizes priority value to match one of the standard priorities.
 * @param {string} priority
 * @returns {string}
 */
export function normalizePriority(priority) {
  if (!priority) return ''
  const lower = String(priority).toLowerCase()
  if (lower === 'critical') return 'Critical'
  if (lower === 'high') return 'High'
  if (lower === 'medium') return 'Medium'
  if (lower === 'low') return 'Low'
  return String(priority)
}

/**
 * Checks if a report matches given filters and search text query.
 * @param {Object} report
 * @param {string} search
 * @param {Object} filters - { category, priority, ward, status }
 * @returns {boolean}
 */
export function matchesReport(report, search = '', filters = {}) {
  if (!report) return false

  const { category, priority, ward, status } = filters

  // 1. Category Filter
  if (category && category !== 'all') {
    const reportCategory = (report.category || '').toLowerCase()
    const targetCategory = category.toLowerCase()
    // Support matching both exact and partial category names (e.g., "Road" matches "Potholes & Road Damage")
    const matchesCat =
      reportCategory === targetCategory ||
      reportCategory.includes(targetCategory) ||
      targetCategory.includes(reportCategory)

    if (!matchesCat) return false
  }

  // 2. Priority Filter
  if (priority && priority !== 'all') {
    const reportPriority = (report.priority || '').toLowerCase()
    const targetPriority = priority.toLowerCase()
    if (reportPriority !== targetPriority) return false
  }

  // 3. Status Filter
  if (status && status !== 'all') {
    const reportStatus = (report.status || '').toLowerCase()
    const targetStatus = status.toLowerCase()
    if (reportStatus !== targetStatus) return false
  }

  // 4. Ward Filter
  if (ward && ward !== 'all') {
    const targetWard = ward.toLowerCase()
    const reportWard = (report.ward || '').toLowerCase()
    const reportAddress = (report.address || '').toLowerCase()
    const reportLocation = (report.location || '').toLowerCase()

    const matchesWard =
      reportWard === targetWard ||
      reportWard.includes(targetWard) ||
      reportAddress.includes(targetWard) ||
      reportLocation.includes(targetWard)

    if (!matchesWard) return false
  }

  // 5. Text Search Query Matching
  const query = (search || '').trim().toLowerCase()
  if (!query) {
    // If no search query, all reports that passed the filters are valid matches
    return true
  }

  const title = (report.title || '').toLowerCase()
  const description = (report.description || '').toLowerCase()
  const reportCategory = (report.category || '').toLowerCase()
  const reportWard = (report.ward || '').toLowerCase()
  const address = (report.address || '').toLowerCase()
  const location = (report.location || '').toLowerCase()
  const reportStatus = (report.status || '').toLowerCase()
  const reportPriority = (report.priority || '').toLowerCase()
  const displayId = getDisplayId(report).toLowerCase()
  const complaintId = (report.complaintId || '').toLowerCase()
  const id = (report.id || '').toLowerCase()
  const department = (report.department || '').toLowerCase()

  return (
    title.includes(query) ||
    description.includes(query) ||
    reportCategory.includes(query) ||
    reportWard.includes(query) ||
    address.includes(query) ||
    location.includes(query) ||
    reportStatus.includes(query) ||
    reportPriority.includes(query) ||
    displayId.includes(query) ||
    complaintId.includes(query) ||
    id.includes(query) ||
    department.includes(query)
  )
}

