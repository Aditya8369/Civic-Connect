import { SUPPORT_EMAIL } from '@/data/faqs'
import { SLA_DURATIONS_HOURS, DEFAULT_SLA_HOURS } from '@/utils/sla'

export const DEFAULT_OFFICE_HOURS = {
  isSample: true,
  title: 'Sample Office Hours (Reference)',
  weekdays: '09:30 AM – 05:30 PM (Mon – Fri)',
  saturday: '09:30 AM – 01:30 PM (1st & 3rd Sat)',
  sunday: 'Closed for In-Person Counters',
  disclaimer:
    'Sample administrative hours for reference. Official counter timings and public hearing hours are determined by local municipal notification. Emergency services (Water/Electricity) remain 24x7.',
}

export const MUNICIPAL_CONTACT_INFO = {
  email: SUPPORT_EMAIL || 'admin_contact@civic.in',
  helpline: null, // Configurable by local administration; no unverified number shown
  onlineDesk: 'Available 24x7 via CivicConnect Portal',
  disclaimer:
    'Official zonal contact numbers are configured by local municipal administration.',
}

export const MUNICIPAL_DIRECTORY_INFO = {
  jurisdiction: 'Central Municipal Zone & Local Wards',
  supportedWardsCount: 12,
  description:
    'CivicConnect supports grievance tracking across Wards 1 through 12. Specific zonal demarcations and ward counselor assignments are configured by urban local government.',
}

export const MUNICIPAL_SLA_SUMMARY = [
  {
    category: 'Water & Electricity',
    duration: '24 Hours',
    hours: SLA_DURATIONS_HOURS.Water || 24,
    description: 'Pipeline bursts, main supply cutoffs, and electrical hazards',
  },
  {
    category: 'Streetlights & Traffic',
    duration: '24 Hours',
    hours: SLA_DURATIONS_HOURS['Streetlight Issues'] || 24,
    description: 'Blacked out street fixtures, damaged signals, and junction issues',
  },
  {
    category: 'Sanitation & Solid Waste',
    duration: '48 Hours',
    hours: SLA_DURATIONS_HOURS.Sanitation || 48,
    description: 'Garbage accumulation, uncleaned public bins, and drain blockages',
  },
  {
    category: 'Roads & Infrastructure',
    duration: '7 Days',
    hours: SLA_DURATIONS_HOURS.Roads || 168,
    description: 'Pothole restoration, pavement cave-ins, and road divider repairs',
  },
  {
    category: 'General Redressal SLA',
    duration: `${DEFAULT_SLA_HOURS} Hours`,
    hours: DEFAULT_SLA_HOURS,
    description: 'Standard departmental grievance inspection and initial citizen response',
  },
]

export const CITIZEN_CHARTER_DETAILS = {
  title: 'Citizen Grievance Redressal Charter',
  summary:
    'The CivicConnect Municipal Grievance Charter establishes time-bound grievance response, transparent departmental allocation, and non-discriminatory municipal public services.',
  commitments: [
    'Digital acknowledgment within 60 minutes of grievance submission.',
    'Transparent allocation to the jurisdictional zonal engineer or department officer.',
    'Strict SLA adherence based on category urgency with public countdown tracking.',
    'Ground-level photo and milestone verification before complaint closure.',
    'Right to reopen or appeal unverified or substandard grievance resolutions within 7 days.',
  ],
}

export const RTI_CHARTER_DETAILS = {
  title: 'Right to Information (RTI) Compliance',
  summary:
    'In accordance with public-sector transparency mandates, municipal operations, public works tenders, and grievance audit logs are maintained for citizen scrutiny.',
  guidelines: [
    'Public Information Officer (PIO) nodal contact available at Central Municipal Zone desk.',
    'Grievance audit trail documents, reference IDs, and departmental resolution logs may be requested.',
    'Standard statutory response timelines apply as per prevailing Right to Information rules.',
    'For proactive disclosure and budget inquiries, consult the municipal administrative portal.',
  ],
}
