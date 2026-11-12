import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getDisplayId } from '@/firebase/complaintId'
import { formatDateStamp } from '@/utils/csv'
import { isSlaBreached, parseTimestamp } from '@/utils/sla'

const STATUS_LABELS = {
  all: 'All',
  pending: 'Pending',
  'in-progress': 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
  reopened: 'Reopened',
}

const SLA_LABELS = { all: 'All', breached: 'Breached SLA only' }

const UNASSIGNED = 'Not assigned'

export const PDF_TABLE_HEAD = [
  'Complaint ID',
  'Date',
  'Title',
  'Category',
  'Department',
  'Status',
  'SLA',
  'Address',
]

/** Headline counts and the per-department breakdown for the filtered complaints. */
export function buildReportSummary(complaints, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now
  const summary = { total: complaints.length, resolved: 0, open: 0, rejected: 0, slaBreached: 0 }
  const byDept = new Map()

  for (const c of complaints) {
    const status = (c.status || '').toLowerCase()
    const breached = isSlaBreached(c, nowMs)
    const dept = c.department || UNASSIGNED
    if (!byDept.has(dept)) byDept.set(dept, { department: dept, total: 0, resolved: 0, slaBreached: 0 })
    const row = byDept.get(dept)
    row.total += 1

    if (status === 'resolved') {
      summary.resolved += 1
      row.resolved += 1
    } else if (status === 'rejected') {
      summary.rejected += 1
    } else {
      summary.open += 1
    }
    if (breached) {
      summary.slaBreached += 1
      row.slaBreached += 1
    }
  }

  summary.departments = [...byDept.values()].sort(
    (a, b) => b.total - a.total || a.department.localeCompare(b.department)
  )
  return summary
}

/** [label, value] pairs describing the active dashboard filters, in display order. */
export function describeFilters(filters = {}) {
  const {
    status = 'all',
    department = 'all',
    category = 'all',
    sla = 'all',
    search = '',
    dateFrom = '',
    dateTo = '',
  } = filters
  const range =
    dateFrom && dateTo
      ? `${dateFrom} to ${dateTo}`
      : dateFrom
        ? `From ${dateFrom}`
        : dateTo
          ? `Up to ${dateTo}`
          : 'All dates'

  return [
    ['Date range', range],
    ['Department', department === 'all' ? 'All' : department],
    ['Status', STATUS_LABELS[status] || status],
    ['Category', category === 'all' ? 'All' : category],
    ['SLA', SLA_LABELS[sla] || sla],
    ['Search', search?.trim() ? `"${search.trim()}"` : 'None'],
  ]
}

// The built-in PDF fonts only cover Latin-1; anything else would print as garbage, so show "?" instead.
export function toPdfText(value) {
  if (value == null) return ''
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, '?')
    .trim()
}

function slaLabel(complaint, nowMs) {
  const status = (complaint.status || '').toLowerCase()
  if (status === 'resolved' || status === 'rejected') return '-'
  return isSlaBreached(complaint, nowMs) ? 'Breached' : 'On track'
}

/** One table row per complaint, matching PDF_TABLE_HEAD. */
export function toPdfRows(complaints, now = Date.now()) {
  const nowMs = now instanceof Date ? now.getTime() : now
  return complaints.map((c) => {
    const createdMs = parseTimestamp(c.createdAt)
    return [
      getDisplayId(c),
      createdMs === null ? '' : formatDateStamp(new Date(createdMs)),
      c.title,
      c.category,
      c.department || UNASSIGNED,
      c.status,
      slaLabel(c, nowMs),
      c.address,
    ].map(toPdfText)
  })
}

export function buildReportFilename(now = new Date()) {
  return `civic-report-${formatDateStamp(now)}.pdf`
}

const BRAND = [30, 64, 175]
const MARGIN = 14

/** Builds the executive report and returns the jsPDF document (nothing is downloaded or uploaded). */
export function generateComplaintsPdf({ complaints, filters = {}, now = new Date() }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const summary = buildReportSummary(complaints, now)

  // Branding band
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, pageWidth, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Civic-Connect', MARGIN, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text('Municipal Complaints Report', MARGIN, 18)
  doc.setFontSize(9)
  doc.text(`Generated ${formatDateStamp(now)}`, pageWidth - MARGIN, 18, { align: 'right' })

  // Filter criteria
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Filter criteria', MARGIN, 33)
  autoTable(doc, {
    startY: 35,
    theme: 'plain',
    body: [describeFilters(filters).map(([label, value]) => `${label}: ${toPdfText(value)}`)],
    styles: { fontSize: 9, cellPadding: 1 },
    margin: { left: MARGIN, right: MARGIN },
  })

  // Key metrics
  let y = (doc.lastAutoTable?.finalY ?? 42) + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Key metrics', MARGIN, y)
  autoTable(doc, {
    startY: y + 2,
    head: [['Total complaints', 'Resolved', 'Open', 'Rejected', 'SLA breaches']],
    body: [[summary.total, summary.resolved, summary.open, summary.rejected, summary.slaBreached]],
    theme: 'grid',
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 10, halign: 'center' },
    margin: { left: MARGIN, right: MARGIN },
  })

  // Department breakdown
  y = (doc.lastAutoTable?.finalY ?? y + 20) + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Department breakdown', MARGIN, y)
  autoTable(doc, {
    startY: y + 2,
    head: [['Department', 'Total', 'Resolved', 'SLA breaches']],
    body: summary.departments.map((d) => [
      toPdfText(d.department),
      d.total,
      d.resolved,
      d.slaBreached,
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 9 },
    margin: { left: MARGIN, right: MARGIN },
  })

  // Complaint list (head repeats on every page, rows never split across pages)
  y = (doc.lastAutoTable?.finalY ?? y + 20) + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Complaints (${summary.total})`, MARGIN, y)
  autoTable(doc, {
    startY: y + 2,
    head: [PDF_TABLE_HEAD],
    body: toPdfRows(complaints, now),
    theme: 'striped',
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 8, overflow: 'linebreak', cellPadding: 1.8 },
    columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 22 }, 6: { cellWidth: 20 } },
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    margin: { left: MARGIN, right: MARGIN, bottom: 14 },
  })

  // Page numbers (needs the final page count, so done after all tables)
  const pages = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i)
    doc.text('Civic-Connect - Municipal Complaints Report', MARGIN, pageHeight - 6)
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' })
  }

  return doc
}

export function downloadComplaintsPdf(options) {
  const doc = generateComplaintsPdf(options)
  doc.save(buildReportFilename(options.now))
  return doc
}
