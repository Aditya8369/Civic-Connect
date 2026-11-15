
import { describe, it, expect, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@/contexts/LanguageContext'
import {
  PrintableGrievanceReceipt,
  ReceiptQrCode,
  formatReceiptDate,
  getComplaintTrackingUrl,
} from './PrintableGrievanceReceipt'

const mockComplaint = {
  id: 'issue-123',
  complaintId: 'CMP-2026-0042',
  title: 'Large Pothole on 5th Cross Road',
  description: 'Deep road cavity causing two-wheelers to skid near junction.',
  category: 'Potholes & Road Damage',
  department: 'Roads & Infrastructure',
  status: 'In Progress',
  address: '5th Cross Rd, Indiranagar, Bengaluru',
  ward: 'Ward 82',
  latitude: 12.9716,
  longitude: 77.5946,
  reportedBy: 'user-abc',
  citizenName: 'Jane Citizen',
  userEmail: 'jane.citizen@example.com',
  phone: '+91 98765 43210',
  citizenAddress: 'Flat 302, Green Meadows, Indiranagar',
  createdAt: new Date(2026, 10, 10, 9, 30, 0),
}

beforeEach(() => {
  localStorage.setItem('civic-connect-language', 'en')
})

function renderWithLanguage(component) {
  return renderToStaticMarkup(
    <LanguageProvider>
      {component}
    </LanguageProvider>
  )
}

describe('formatReceiptDate', () => {
  it('formats JS Date objects correctly', () => {
    const formatted = formatReceiptDate(new Date(2026, 10, 12, 14, 30))
    expect(formatted).toContain('2026')
    expect(formatted).toContain('Nov')
  })

  it('formats Firestore-style Timestamp with toDate()', () => {
    const mockTs = {
      toDate: () => new Date(2026, 10, 5, 10, 15),
    }
    const formatted = formatReceiptDate(mockTs)
    expect(formatted).toContain('2026')
    expect(formatted).toContain('Nov')
  })

  it('formats timestamp with seconds property', () => {
    const seconds = Math.floor(new Date(2026, 10, 5).getTime() / 1000)
    const formatted = formatReceiptDate({ seconds })
    expect(formatted).toContain('2026')
  })

  it('returns "-" for null, undefined, or empty values', () => {
    expect(formatReceiptDate(null)).toBe('-')
    expect(formatReceiptDate(undefined)).toBe('-')
    expect(formatReceiptDate('')).toBe('-')
  })
})

describe('getComplaintTrackingUrl', () => {
  it('builds canonical tracking URL using complaintId', () => {
    const url = getComplaintTrackingUrl({ complaintId: 'CMP-2026-0042' })
    expect(url).toContain('/complaints/CMP-2026-0042')
  })

  it('falls back to document id if complaintId is absent', () => {
    const url = getComplaintTrackingUrl({ id: 'doc-789' })
    expect(url).toContain('/complaints/doc-789')
  })

  it('returns empty string if neither id exists', () => {
    expect(getComplaintTrackingUrl(null)).toBe('')
    expect(getComplaintTrackingUrl({})).toBe('')
  })

  it('does NOT leak sensitive citizen info or database secrets into tracking URL', () => {
    const url = getComplaintTrackingUrl({
      complaintId: 'CMP-2026-0042',
      reportedBy: 'user-abc',
      userEmail: 'jane.citizen@example.com',
      citizenAddress: 'Secret St',
      firebaseToken: 'secret_123',
    })
    expect(url).not.toContain('jane.citizen')
    expect(url).not.toContain('user-abc')
    expect(url).not.toContain('secret')
  })
})

describe('ReceiptQrCode Component', () => {
  it('renders a genuine vector SVG element with crisp edges', () => {
    const html = renderWithLanguage(
      <ReceiptQrCode value="https://civicconnect.local/complaints/CMP-2026-0042" />
    )

    expect(html).toContain('<svg')
    expect(html).toContain('aria-label="Verification QR Code"')
    expect(html).toContain('data-testid="receipt-qr-code"')
    expect(html).toContain('shape-rendering="crispEdges"')
    expect(html).toContain('<path')
  })

  it('renders fallback when value is empty', () => {
    const html = renderWithLanguage(
      <ReceiptQrCode value="" />
    )

    expect(html).toContain('data-testid="receipt-qr-fallback"')
    expect(html).toContain('QR Unavailable')
  })
})

describe('PrintableGrievanceReceipt Component', () => {
  it('renders correctly and includes official municipal heading', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('MUNICIPAL GRIEVANCE RECEIPT')
    expect(html).toContain('CivicConnect Municipal Corporation')
    expect(html).toContain('ORIGINAL CITIZEN COPY')
  })

  it('displays the complaint tracking ID and submission date', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('CMP-2026-0042')
    expect(html).toContain('data-testid="receipt-complaint-id"')
    expect(html).toContain('data-testid="receipt-submission-date"')
  })

  it('displays the complaint status and assigned department', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('IN PROGRESS')
    expect(html).toContain('Roads &amp; Infrastructure')
  })

  it('displays category, title, description, and incident location', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('Potholes &amp; Road Damage')
    expect(html).toContain('Large Pothole on 5th Cross Road')
    expect(html).toContain('Deep road cavity causing two-wheelers to skid near junction.')
    expect(html).toContain('5th Cross Rd, Indiranagar, Bengaluru')
    expect(html).toContain('Ward 82')
    expect(html).toContain('GPS: 12.9716, 77.5946')
  })

  it('displays citizen information when viewing own complaint (authorized)', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        citizen={{
          name: 'Jane Citizen',
          email: 'jane.citizen@example.com',
          phone: '+91 98765 43210',
          address: 'Flat 302, Green Meadows',
        }}
        user={{ uid: 'user-abc', role: 'citizen' }}
      />
    )

    expect(html).toContain('Jane Citizen')
    expect(html).toContain('jane.citizen@example.com')
    expect(html).toContain('+91 98765 43210')
    expect(html).toContain('Flat 302, Green Meadows')
  })

  it('protects citizen contact info when viewed by an unauthorized third party', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'unauthorized-stranger', role: 'citizen' }}
      />
    )

    // Private email and phone should not be exposed
    expect(html).not.toContain('jane.citizen@example.com')
    expect(html).not.toContain('+91 98765 43210')
  })

  it('allows administrator to view citizen details for municipal processing', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        citizen={{
          name: 'Jane Citizen',
          email: 'jane.citizen@example.com',
        }}
        user={{ uid: 'admin-1', role: 'admin' }}
      />
    )

    expect(html).toContain('Jane Citizen')
    expect(html).toContain('jane.citizen@example.com')
  })

  it('renders verification section with instruction and scannable QR code', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('Scan to verify complaint details.')
    expect(html).toContain('Official Digital Verification')
    expect(html).toContain('data-testid="receipt-qr-code"')
    expect(html).toContain('/complaints/CMP-2026-0042')
  })

  it('includes municipal acknowledgment and signature placeholders for physical records', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt
        complaint={mockComplaint}
        user={{ uid: 'user-abc' }}
      />
    )

    expect(html).toContain('Citizen Acknowledgment:')
    expect(html).toContain('Receiving Authority:')
    expect(html).toContain('Municipal Office Seal')
    expect(html).toContain('Signature / Date')
  })

  it('gracefully handles missing optional fields without crashing or rendering undefined', () => {
    const sparseComplaint = {
      title: 'Minimal Complaint',
      // No id, no dates, no department, no category, no location, no citizen info
    }

    const html = renderWithLanguage(
      <PrintableGrievanceReceipt complaint={sparseComplaint} />
    )

    expect(html).toContain('MUNICIPAL GRIEVANCE RECEIPT')
    expect(html).toContain('Minimal Complaint')
    expect(html).toContain('PENDING')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('null')
  })

  it('returns null safely when complaint prop is null', () => {
    const html = renderWithLanguage(
      <PrintableGrievanceReceipt complaint={null} />
    )

    expect(html).toBe('')
  })
})
