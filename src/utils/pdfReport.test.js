import { describe, it, expect, vi } from 'vitest'

vi.mock('@/firebase/services', () => ({ db: {} }))

import {
  PDF_TABLE_HEAD,
  buildReportFilename,
  buildReportSummary,
  describeFilters,
  generateComplaintsPdf,
  toPdfRows,
  toPdfText,
} from './pdfReport'

const NOW = new Date(2026, 10, 12, 12, 0, 0) // 12 Nov 2026, local
const HOUR = 3600000

function complaint(overrides = {}) {
  return {
    id: 'a',
    complaintId: 'CMP-2026-0001',
    title: 'Pothole near market',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    status: 'Pending',
    address: 'Main Rd',
    createdAt: new Date(NOW.getTime() - 2 * HOUR),
    ...overrides,
  }
}

describe('buildReportSummary', () => {
  const list = [
    complaint({ id: '1', status: 'Resolved' }),
    complaint({ id: '2', status: 'Pending', createdAt: new Date(NOW.getTime() - 200 * HOUR) }), // Roads SLA 168h -> breached
    complaint({ id: '3', status: 'In Progress', department: 'Water', category: 'Water Leakage' }),
    complaint({ id: '4', status: 'Rejected', department: 'Water', category: 'Water Leakage' }),
    complaint({ id: '5', status: 'Reopened', department: '', category: 'Other' }),
  ]

  it('counts totals, resolved, open, rejected and SLA breaches', () => {
    const s = buildReportSummary(list, NOW)
    expect(s).toMatchObject({ total: 5, resolved: 1, open: 3, rejected: 1, slaBreached: 1 })
  })

  it('breaks counts down per department, largest first, with a bucket for unassigned', () => {
    const { departments } = buildReportSummary(list, NOW)
    expect(departments).toEqual([
      { department: 'Roads', total: 2, resolved: 1, slaBreached: 1 },
      { department: 'Water', total: 2, resolved: 0, slaBreached: 0 },
      { department: 'Not assigned', total: 1, resolved: 0, slaBreached: 0 },
    ])
  })

  it('handles an empty list', () => {
    expect(buildReportSummary([], NOW)).toMatchObject({ total: 0, resolved: 0, slaBreached: 0, departments: [] })
  })
})

describe('describeFilters', () => {
  it('shows defaults when nothing is filtered', () => {
    expect(Object.fromEntries(describeFilters({}))).toEqual({
      'Date range': 'All dates',
      Department: 'All',
      Status: 'All',
      Category: 'All',
      SLA: 'All',
      Search: 'None',
    })
  })

  it('translates active filters into readable labels', () => {
    const out = Object.fromEntries(
      describeFilters({
        status: 'in-progress',
        department: 'Roads',
        category: 'Other',
        sla: 'breached',
        search: '  pothole ',
        dateFrom: '2026-11-01',
        dateTo: '2026-11-12',
      })
    )
    expect(out).toEqual({
      'Date range': '2026-11-01 to 2026-11-12',
      Department: 'Roads',
      Status: 'In Progress',
      Category: 'Other',
      SLA: 'Breached SLA only',
      Search: '"pothole"',
    })
  })

  it('describes one-sided date ranges', () => {
    expect(Object.fromEntries(describeFilters({ dateFrom: '2026-11-01' }))['Date range']).toBe('From 2026-11-01')
    expect(Object.fromEntries(describeFilters({ dateTo: '2026-11-12' }))['Date range']).toBe('Up to 2026-11-12')
  })
})

describe('toPdfText', () => {
  it('keeps Latin-1, flattens whitespace and replaces unsupported characters', () => {
    expect(toPdfText('Café\nRoad')).toBe('Café Road')
    expect(toPdfText('सड़क')).toBe('????')
    expect(toPdfText(null)).toBe('')
  })
})

describe('toPdfRows', () => {
  it('maps complaints to rows matching the table header', () => {
    const [row] = toPdfRows([complaint({ createdAt: new Date(2026, 10, 12, 8, 0) })], NOW)
    expect(row).toHaveLength(PDF_TABLE_HEAD.length)
    expect(row).toEqual([
      'CMP-2026-0001',
      '2026-11-12',
      'Pothole near market',
      'Potholes & Road Damage',
      'Roads',
      'Pending',
      'On track',
      'Main Rd',
    ])
  })

  it('marks breached, resolved and missing values correctly', () => {
    const rows = toPdfRows(
      [
        complaint({ createdAt: new Date(NOW.getTime() - 300 * HOUR) }),
        complaint({ status: 'Resolved' }),
        complaint({ department: '', address: undefined, createdAt: null }),
      ],
      NOW
    )
    expect(rows[0][6]).toBe('Breached')
    expect(rows[1][6]).toBe('-')
    expect(rows[2][1]).toBe('')
    expect(rows[2][4]).toBe('Not assigned')
    expect(rows[2][7]).toBe('')
  })
})

describe('buildReportFilename', () => {
  it('uses the local date stamp', () => {
    expect(buildReportFilename(NOW)).toBe('civic-report-2026-11-12.pdf')
  })
})

describe('generateComplaintsPdf', () => {
  const many = (n) =>
    Array.from({ length: n }, (_, i) =>
      complaint({
        id: String(i),
        complaintId: `CMP-2026-${String(i + 1).padStart(4, '0')}`,
        title: `Complaint number ${i + 1}`,
        status: i % 3 === 0 ? 'Resolved' : 'Pending',
        department: ['Roads', 'Water', 'Sanitation'][i % 3],
        address: 'Some long address line, near the old market, Dehradun, Uttarakhand',
      })
    )

  it('produces a valid single-page PDF for a small list', () => {
    const doc = generateComplaintsPdf({ complaints: many(3), filters: {}, now: NOW })
    expect(doc.getNumberOfPages()).toBe(1)
    const bytes = new Uint8Array(doc.output('arraybuffer'))
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('paginates 150 records across several pages', () => {
    const doc = generateComplaintsPdf({ complaints: many(150), filters: {}, now: NOW })
    expect(doc.getNumberOfPages()).toBeGreaterThan(3)
  })

  it('still renders when the filtered list is empty', () => {
    const doc = generateComplaintsPdf({ complaints: [], filters: { status: 'resolved' }, now: NOW })
    expect(doc.getNumberOfPages()).toBe(1)
  })
})
