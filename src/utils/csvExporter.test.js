// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/firebase/services', () => ({ db: {} }))

import {
  COMPLAINT_CSV_HEADERS,
  buildComplaintsCsv,
  buildComplaintsCsvFilename,
  complaintToCsvRow,
  exportComplaintsToCSV,
} from './csvExporter'
import { getDisplayId } from '@/firebase/complaintId'
import { parseCsv } from './testSupport/parseCsv'

const ts = (date) => ({ toDate: () => date })

function complaint(overrides = {}) {
  return {
    id: 'doc1',
    complaintId: 'CMP-2026-0001',
    title: 'Pothole near market',
    category: 'Potholes & Road Damage',
    department: 'Roads',
    status: 'Pending',
    address: 'Main Rd',
    createdAt: ts(new Date(2026, 10, 12, 9, 30)),
    assignedWorker: { name: 'Ravi', phone: '+91 9876543210' },
    ...overrides,
  }
}

const COL = Object.fromEntries(COMPLAINT_CSV_HEADERS.map((h, i) => [h, i]))

describe('COMPLAINT_CSV_HEADERS', () => {
  it('has the expected columns in order', () => {
    expect(COMPLAINT_CSV_HEADERS).toEqual([
      'Ticket ID',
      'Title',
      'Category',
      'Department',
      'Status',
      'Address',
      'Created Date',
      'Assigned Worker',
      'Worker Phone',
    ])
  })
})

describe('complaintToCsvRow', () => {
  it('maps a complaint to the header order', () => {
    const row = complaintToCsvRow(complaint())
    expect(row).toHaveLength(COMPLAINT_CSV_HEADERS.length)
    expect(row).toEqual([
      'CMP-2026-0001',
      'Pothole near market',
      'Potholes & Road Damage',
      'Roads',
      'Pending',
      'Main Rd',
      '2026-11-12',
      'Ravi',
      '+91 9876543210',
    ])
  })

  it('leaves unknown values empty instead of inventing them, and marks unassigned fields like the UI does', () => {
    vi.useFakeTimers({ now: new Date(2026, 5, 1) })
    try {
      expect(complaintToCsvRow({ id: 'x' })).toEqual([
        'CMP-2026-XXXX', // same placeholder the admin UI shows
        '',
        '',
        'Not assigned',
        '', // no fabricated "Pending"
        '',
        '',
        'Not assigned',
        '',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not throw for null or undefined', () => {
    expect(() => complaintToCsvRow(null)).not.toThrow()
    expect(() => complaintToCsvRow(undefined)).not.toThrow()
  })

  it('treats a worker without a phone (or without a name) sensibly', () => {
    expect(complaintToCsvRow(complaint({ assignedWorker: { name: 'Ravi' } }))[COL['Worker Phone']]).toBe('')
    expect(complaintToCsvRow(complaint({ assignedWorker: null }))[COL['Assigned Worker']]).toBe('Not assigned')
  })
})

describe('Ticket ID', () => {
  it('is identical to getDisplayId (what the admin page and PDF show)', () => {
    const cases = [
      complaint(),
      complaint({ complaintId: '' }),
      complaint({ complaintId: null }),
      complaint({ complaintId: undefined, ticketId: 'CMP-2026-7777' }),
      { id: 'only-a-doc-id' },
      {},
    ]
    for (const c of cases) {
      expect(complaintToCsvRow(c)[COL['Ticket ID']]).toBe(getDisplayId(c))
    }
  })

  it('uses complaintId when present, ignoring the legacy ticketId and the document id', () => {
    const row = complaintToCsvRow(complaint({ complaintId: 'CMP-2026-0042', ticketId: 'CMP-2026-9999', id: 'abc' }))
    expect(row[COL['Ticket ID']]).toBe('CMP-2026-0042')
  })

  it('never leaks the raw Firestore document id', () => {
    const id = complaintToCsvRow({ id: 'Zk3f9QxRawDocId', complaintId: '' })[COL['Ticket ID']]
    expect(id).not.toContain('Zk3f9QxRawDocId')
    expect(id).toMatch(/^CMP-\d{4}-XXXX$/)
  })
})

describe('Created Date', () => {
  const dateOf = (createdAt) => complaintToCsvRow(complaint({ createdAt }))[COL['Created Date']]

  it('converts a Firestore Timestamp (toDate)', () => {
    expect(dateOf(ts(new Date(2026, 3, 9, 18, 45)))).toBe('2026-04-09')
  })

  it('converts a JavaScript Date', () => {
    expect(dateOf(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('converts a { seconds } timestamp object', () => {
    expect(dateOf({ seconds: new Date(2026, 2, 3, 12).getTime() / 1000 })).toBe('2026-03-03')
  })

  it('uses the local calendar day near midnight', () => {
    expect(dateOf(new Date(2026, 5, 15, 23, 59))).toBe('2026-06-15')
    expect(dateOf(new Date(2026, 5, 15, 0, 1))).toBe('2026-06-15')
  })

  it('leaves the cell empty for missing or invalid dates', () => {
    expect(dateOf(undefined)).toBe('')
    expect(dateOf(null)).toBe('')
    expect(dateOf(new Date('nope'))).toBe('')
    expect(dateOf(ts(new Date('nope')))).toBe('')
    expect(dateOf({ seconds: NaN })).toBe('')
    expect(dateOf({ toDate: () => { throw new Error('boom') } })).toBe('')
  })
})

describe('buildComplaintsCsv', () => {
  it('returns only the header row for an empty list, undefined, or a non-array', () => {
    const header = COMPLAINT_CSV_HEADERS.join(',')
    expect(buildComplaintsCsv([])).toBe(header)
    expect(buildComplaintsCsv()).toBe(header)
    expect(buildComplaintsCsv(null)).toBe(header)
    expect(buildComplaintsCsv({})).toBe(header)
  })

  it('writes one record per complaint with CRLF separators', () => {
    const csv = buildComplaintsCsv([complaint(), complaint({ id: 'doc2' }), complaint({ id: 'doc3' })])
    expect(csv.split('\r\n')).toHaveLength(4)
    expect(csv.endsWith('\r\n')).toBe(false)
  })

  it('keeps the input order', () => {
    const rows = parseCsv(
      buildComplaintsCsv([complaint({ title: 'B' }), complaint({ title: 'A' }), complaint({ title: 'C' })])
    )
    expect(rows.slice(1).map((r) => r[COL.Title])).toEqual(['B', 'A', 'C'])
  })

  it('round-trips commas, double quotes and multi-line text', () => {
    const rows = parseCsv(
      buildComplaintsCsv([
        complaint({
          title: 'Broken "main" pipe, again',
          address: 'Line one\nLine two, Dehradun\r\nLine three',
        }),
      ])
    )
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveLength(COMPLAINT_CSV_HEADERS.length)
    expect(rows[1][COL.Title]).toBe('Broken "main" pipe, again')
    expect(rows[1][COL.Address]).toBe('Line one\nLine two, Dehradun\r\nLine three')
  })

  it('round-trips a full complaint exactly', () => {
    const rows = parseCsv(buildComplaintsCsv([complaint()]))
    expect(rows[0]).toEqual(COMPLAINT_CSV_HEADERS)
    expect(rows[1]).toEqual(complaintToCsvRow(complaint()).map((v) => (v.startsWith('+') ? `'${v}` : v)))
  })

  it('preserves Unicode text', () => {
    const rows = parseCsv(
      buildComplaintsCsv([
        complaint({ title: 'सड़क में गड्ढा', address: 'राजपुर रोड, देहरादून 🚧', assignedWorker: { name: 'रवि कुमार', phone: '' } }),
      ])
    )
    expect(rows[1][COL.Title]).toBe('सड़क में गड्ढा')
    expect(rows[1][COL.Address]).toBe('राजपुर रोड, देहरादून 🚧')
    expect(rows[1][COL['Assigned Worker']]).toBe('रवि कुमार')
  })
})

describe('formula injection in every exported field', () => {
  const PAYLOAD = '=HYPERLINK("http://evil.example","click")'
  const textFields = {
    Title: (v) => ({ title: v }),
    Category: (v) => ({ category: v }),
    Department: (v) => ({ department: v }),
    Status: (v) => ({ status: v }),
    Address: (v) => ({ address: v }),
    'Assigned Worker': (v) => ({ assignedWorker: { name: v, phone: '' } }),
    'Worker Phone': (v) => ({ assignedWorker: { name: 'Ravi', phone: v } }),
    'Ticket ID': (v) => ({ complaintId: v }),
  }

  for (const [column, make] of Object.entries(textFields)) {
    it(`neutralises ${column}`, () => {
      for (const prefix of ['', ' ', '\t', '\r', '\n', '   ']) {
        for (const trigger of ['=', '+', '-', '@']) {
          const value = `${prefix}${trigger}${PAYLOAD.slice(1)}`
          const rows = parseCsv(buildComplaintsCsv([complaint(make(value))]))
          expect(rows[1][COL[column]], JSON.stringify(value)).toBe(`'${value}`)
        }
      }
    })
  }

  it('never lets a cell begin with a formula trigger', () => {
    const evil = complaint({
      title: '=1+1',
      category: '+1',
      department: '-1',
      status: '@SUM(1)',
      address: ' =cmd|calc',
      assignedWorker: { name: '\t=1', phone: '\r+1' },
    })
    const [, row] = parseCsv(buildComplaintsCsv([evil]))
    for (const cell of row) {
      expect(cell).not.toMatch(/^[\s]*[=+\-@]/)
    }
  })
})

describe('buildComplaintsCsvFilename', () => {
  it('uses the local date', () => {
    expect(buildComplaintsCsvFilename(new Date(2026, 0, 5, 23, 59))).toBe('civic_connect_reports_2026-01-05.csv')
  })

  it('defaults to today and always ends in .csv', () => {
    expect(buildComplaintsCsvFilename()).toMatch(/^civic_connect_reports_\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('falls back to a plain name for an invalid date', () => {
    expect(buildComplaintsCsvFilename(new Date('nope'))).toBe('civic_connect_reports.csv')
  })
})

describe('exportComplaintsToCSV', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function stubDownload() {
    const create = vi.fn(() => 'blob:fake')
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke })
    let downloadName = null
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      downloadName = this.download
    })
    return { create, revoke, click, name: () => downloadName }
  }

  it('does nothing for an empty or invalid list', () => {
    const { create, click } = stubDownload()
    expect(exportComplaintsToCSV([])).toBe(0)
    expect(exportComplaintsToCSV(undefined)).toBe(0)
    expect(exportComplaintsToCSV(null)).toBe(0)
    expect(exportComplaintsToCSV('nope')).toBe(0)
    expect(create).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })

  it('downloads a UTF-8 CSV containing exactly the given complaints and returns the count', async () => {
    vi.useFakeTimers({ now: new Date(2026, 10, 12, 10, 0), toFake: ['Date', 'setTimeout'] })
    const dl = stubDownload()

    const list = [complaint(), complaint({ id: 'doc2', complaintId: 'CMP-2026-0002', title: 'Second' })]
    expect(exportComplaintsToCSV(list)).toBe(2)

    expect(dl.click).toHaveBeenCalledTimes(1)
    expect(dl.name()).toBe('civic_connect_reports_2026-11-12.csv')

    const blob = dl.create.mock.calls[0][0]
    expect(blob.type).toContain('text/csv')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])

    const rows = parseCsv(new TextDecoder().decode(bytes.slice(3)))
    expect(rows).toHaveLength(3)
    expect(rows.slice(1).map((r) => r[COL['Ticket ID']])).toEqual(['CMP-2026-0001', 'CMP-2026-0002'])

    vi.runAllTimers()
    expect(dl.revoke).toHaveBeenCalledWith('blob:fake')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('lets download errors reach the caller', () => {
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('no blob url')
      },
      revokeObjectURL: vi.fn(),
    })
    expect(() => exportComplaintsToCSV([complaint()])).toThrow('no blob url')
  })
})
