import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDateStamp } from './csv'
import { toPdfText } from './pdfReport'

const BRAND = [30, 64, 175]
const MARGIN = 14

/**
 * Builds the Ward Health Scorecards executive PDF document.
 *
 * @param {Object} params
 * @param {Array<Object>} params.wardScorecards
 * @param {Object} params.citywideSummary
 * @param {Object} [params.filters]
 * @param {Date} [params.now=new Date()]
 * @returns {jsPDF}
 */
export function generateWardScorecardsPdf({
  wardScorecards = [],
  citywideSummary = {},
  filters = {},
  now = new Date(),
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // 1. Branding Header
  doc.setFillColor(...BRAND)
  doc.rect(0, 0, pageWidth, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Civic-Connect Municipal Administration', MARGIN, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Ward Infrastructure Health Scorecards & Quarterly Budget Allocation Summary', MARGIN, 18)
  doc.setFontSize(9)
  doc.text(`Generated: ${formatDateStamp(now)}`, pageWidth - MARGIN, 18, { align: 'right' })

  // 2. Executive Key Metrics Banner
  let y = 32
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Executive Municipal Health Indicators', MARGIN, y)

  autoTable(doc, {
    startY: y + 2,
    head: [
      [
        'Total Complaints',
        'Resolved Complaints',
        'Citywide ART (Hours)',
        'SLA Compliance Rate',
        'Citizen Satisfaction',
        'Citywide Health Score',
      ],
    ],
    body: [
      [
        citywideSummary.totalComplaints ?? 0,
        citywideSummary.resolvedComplaints ?? 0,
        `${citywideSummary.averageResolutionTimeHours ?? 0} hrs`,
        `${citywideSummary.slaComplianceRate ?? 100}%`,
        `${citywideSummary.citizenSatisfactionStars ?? 4.0} / 5.0`,
        `${citywideSummary.citywideHealthScore ?? 80} / 100`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: BRAND, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 9.5, halign: 'center', cellPadding: 2 },
    margin: { left: MARGIN, right: MARGIN },
  })

  // 3. Ward Infrastructure Health Scorecards Breakdown
  y = (doc.lastAutoTable?.finalY ?? y + 20) + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Ward Infrastructure Health Scorecards Breakdown', MARGIN, y)

  const head = [
    [
      'Ward ID',
      'Ward Name',
      'Municipal Zone',
      'Total',
      'Resolved',
      'ART (hrs)',
      'SLA %',
      'CSI (Stars)',
      'Score',
      'Grade',
      'Budget Priority',
    ],
  ]

  const rows = wardScorecards.map((w) => [
    toPdfText(w.wardId),
    toPdfText(w.wardName),
    toPdfText(w.zoneName),
    w.totalIssues,
    w.resolvedIssues,
    w.averageResolutionTimeHours,
    `${w.slaComplianceRate}%`,
    `${w.citizenSatisfactionStars}`,
    w.healthScore,
    w.healthGrade,
    toPdfText(w.budgetPriority),
  ])

  autoTable(doc, {
    startY: y + 2,
    head,
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: BRAND, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 1.8, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 50 },
      2: { cellWidth: 42 },
      9: { fontStyle: 'bold', halign: 'center' },
      10: { cellWidth: 46 },
    },
    rowPageBreak: 'avoid',
    showHead: 'everyPage',
    margin: { left: MARGIN, right: MARGIN, bottom: 20 },
  })

  // 4. Quarterly Budget Allocation Recommendation Section
  y = (doc.lastAutoTable?.finalY ?? y + 20) + 6
  if (y < doc.internal.pageSize.getHeight() - 35) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.text('Quarterly Municipal Budget Allocation Guidance', MARGIN, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(60, 60, 60)

    const distressed = citywideSummary.mostDistressedWard
    const top = citywideSummary.topPerformingWard

    const adviceText = [
      `1. Priority Resource Infusion: Ward ${distressed?.wardId || 'WARD-01'} (${distressed?.wardName || ''}) shows the highest infrastructure deficit with a Health Score of ${distressed?.healthScore ?? 0} and ART of ${distressed?.averageResolutionTimeHours ?? 0}h. Immediate allocation of emergency roadworks and sanitation contractors is recommended.`,
      `2. Benchmark Model: Ward ${top?.wardId || ''} (${top?.wardName || ''}) achieved Grade ${top?.healthGrade || 'A'} with an SLA compliance rate of ${top?.slaComplianceRate ?? 100}%. Allocate efficiency incentives to sustain rapid response times.`,
      `3. Infrastructure Backlog Focus: Reallocate 30-35% of discretionary civic capital towards primary backlogs in water distribution and road repaving across Grade C and D wards.`,
    ]

    let lineY = y + 5
    for (const line of adviceText) {
      doc.text(toPdfText(line), MARGIN, lineY)
      lineY += 4.5
    }
  }

  // 5. Page Numbering
  const pages = doc.getNumberOfPages()
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i)
    doc.text(
      'Civic-Connect - Municipal Ward Infrastructure Health Executive Summary',
      MARGIN,
      pageHeight - 6
    )
    doc.text(`Page ${i} of ${pages}`, pageWidth - MARGIN, pageHeight - 6, { align: 'right' })
  }

  return doc
}

/**
 * Generates and triggers download of the Ward Health Scorecards executive PDF.
 */
export function downloadWardScorecardsPdf(options) {
  const doc = generateWardScorecardsPdf(options)
  const filename = `ward-infrastructure-health-executive-summary-${formatDateStamp(options.now || new Date())}.pdf`
  doc.save(filename)
  return doc
}
