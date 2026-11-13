import { toCsv, downloadCsv, formatDateStamp } from './csv'
import { parseTimestamp } from './sla'
import { getDisplayId } from '@/firebase/complaintId'

/**
 * Admin complaint CSV export.
 *
 * Builds on the shared helpers in ./csv.js, which provide:
 *  - RFC 4180 quoting (commas, double quotes and line breaks inside a cell),
 *  - CRLF record separators,
 *  - spreadsheet formula-injection neutralisation,
 *  - a UTF-8 BOM on download so Excel renders non-ASCII text (e.g. Hindi addresses).
 *
 * The exporter only works on the array it is given (the complaints currently
 * visible under the admin's filters), so it never triggers a Firestore re-fetch.
 */

export const COMPLAINT_CSV_HEADERS = [
  'Ticket ID',
  'Title',
  'Category',
  'Department',
  'Status',
  'Address',
  'Created Date',
  'Assigned Worker',
  'Worker Phone',
]

// Same wording the admin UI and the PDF report use for a missing department.
const NOT_ASSIGNED = 'Not assigned'

// Reuses the timestamp parsing the filters use (Firestore Timestamp, Date, { seconds }, ...).
// Missing or invalid dates become an empty cell rather than a made-up value.
function formatCreatedDate(value) {
  const ms = parseTimestamp(value)
  return ms === null ? '' : formatDateStamp(new Date(ms))
}

/**
 * Converts one complaint document into a CSV row (values are escaped later by toCsv).
 * The Ticket ID comes from getDisplayId so it always matches what the admin sees on screen and in the PDF.
 * Status is exported as stored; a missing status stays empty instead of being reported as "Pending".
 */
export function complaintToCsvRow(complaint) {
  return [
    getDisplayId(complaint),
    complaint?.title || '',
    complaint?.category || '',
    complaint?.department || NOT_ASSIGNED,
    complaint?.status || '',
    complaint?.address || '',
    formatCreatedDate(complaint?.createdAt),
    complaint?.assignedWorker?.name || NOT_ASSIGNED,
    complaint?.assignedWorker?.phone || '',
  ]
}

/** Returns the full CSV text (header + one row per complaint) without downloading it. */
export function buildComplaintsCsv(complaints = []) {
  const list = Array.isArray(complaints) ? complaints : []
  return toCsv(COMPLAINT_CSV_HEADERS, list.map(complaintToCsvRow))
}

export function buildComplaintsCsvFilename(date = new Date()) {
  const stamp = formatDateStamp(date)
  return stamp ? `civic_connect_reports_${stamp}.csv` : 'civic_connect_reports.csv'
}

/**
 * Downloads the given complaints as a CSV file.
 * @param {Array} complaints - the currently filtered complaint objects
 * @returns {number} how many complaints were exported (0 means nothing was downloaded)
 */
export function exportComplaintsToCSV(complaints = []) {
  if (!Array.isArray(complaints) || complaints.length === 0) return 0
  downloadCsv(buildComplaintsCsvFilename(), buildComplaintsCsv(complaints))
  return complaints.length
}
