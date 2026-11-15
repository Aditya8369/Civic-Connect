
import { SUPPORT_EMAIL } from '@/data/faqs'
import { SLA_DURATIONS_HOURS, DEFAULT_SLA_HOURS } from '@/utils/sla'

export const DEFAULT_OFFICE_HOURS = {
  isSample: true,
  title: 'Sample Office Hours (Reference)',
  titleKey: 'sampleOfficeHours',
  weekdays: '09:30 AM – 05:30 PM (Mon – Fri)',
  weekdaysKey: 'officeWeekdays',
  saturday: '09:30 AM – 01:30 PM (1st & 3rd Sat)',
  saturdayKey: 'officeSaturday',
  sunday: 'Closed for In-Person Counters',
  sundayKey: 'officeSunday',
  disclaimer:
    'Sample administrative hours for reference. Official counter timings and public hearing hours are determined by local municipal notification. Emergency services (Water/Electricity) remain 24x7.',
  disclaimerKey: 'officeHoursDisclaimer',
}

export const MUNICIPAL_CONTACT_INFO = {
  email: SUPPORT_EMAIL || 'admin_contact@civic.in',
  helpline: null,
  onlineDesk: 'Available 24x7 via CivicConnect Portal',
  onlineDeskKey: 'onlineDeskAvailable',
  disclaimer:
    'Official zonal contact numbers are configured by local municipal administration.',
  disclaimerKey: 'contactDisclaimer',
}

export const MUNICIPAL_DIRECTORY_INFO = {
  jurisdiction: 'Central Municipal Zone & Local Wards',
  supportedWardsCount: 12,
  description:
    'CivicConnect supports grievance tracking across Wards 1 through 12. Specific zonal demarcations and ward counselor assignments are configured by urban local government.',
  descriptionKey: 'wardDirectoryDescription',
}

export const MUNICIPAL_SLA_SUMMARY = [
  {
    category: 'Water & Electricity',
    categoryKey: 'slaWaterElectricity',
    duration: '24 Hours',
    hours: SLA_DURATIONS_HOURS.Water || 24,
    description: 'Pipeline bursts, main supply cutoffs, and electrical hazards',
    descriptionKey: 'slaWaterElectricityDescription',
  },
  {
    category: 'Streetlights & Traffic',
    categoryKey: 'slaStreetlightsTraffic',
    duration: '24 Hours',
    hours: SLA_DURATIONS_HOURS['Streetlight Issues'] || 24,
    description: 'Blacked out street fixtures, damaged signals, and junction issues',
    descriptionKey: 'slaStreetlightsTrafficDescription',
  },
  {
    category: 'Sanitation & Solid Waste',
    categoryKey: 'slaSanitationWaste',
    duration: '48 Hours',
    hours: SLA_DURATIONS_HOURS.Sanitation || 48,
    description: 'Garbage accumulation, uncleaned public bins, and drain blockages',
    descriptionKey: 'slaSanitationWasteDescription',
  },
  {
    category: 'Roads & Infrastructure',
    categoryKey: 'slaRoadsInfrastructure',
    duration: '7 Days',
    hours: SLA_DURATIONS_HOURS.Roads || 168,
    description: 'Pothole restoration, pavement cave-ins, and road divider repairs',
    descriptionKey: 'slaRoadsInfrastructureDescription',
  },
  {
    category: 'General Redressal SLA',
    categoryKey: 'slaGeneral',
    duration: `${DEFAULT_SLA_HOURS} Hours`,
    hours: DEFAULT_SLA_HOURS,
    description: 'Standard departmental grievance inspection and initial citizen response',
    descriptionKey: 'slaGeneralDescription',
  },
]

export const CITIZEN_CHARTER_DETAILS = {
  title: 'Citizen Grievance Redressal Charter',
  titleKey: 'citizenCharterTitle',
  summary:
    'The CivicConnect Municipal Grievance Charter establishes time-bound grievance response, transparent departmental allocation, and non-discriminatory municipal public services.',
  summaryKey: 'citizenCharterSummary',
  commitments: [
    'Digital acknowledgment within 60 minutes of grievance submission.',
    'Transparent allocation to the jurisdictional zonal engineer or department officer.',
    'Strict SLA adherence based on category urgency with public countdown tracking.',
    'Ground-level photo and milestone verification before complaint closure.',
    'Right to reopen or appeal unverified or substandard grievance resolutions within 7 days.',
  ],
  commitmentKeys: [
    'charterCommitment1',
    'charterCommitment2',
    'charterCommitment3',
    'charterCommitment4',
    'charterCommitment5',
  ],
}

export const RTI_CHARTER_DETAILS = {
  title: 'Right to Information (RTI) Compliance',
  titleKey: 'rtiTitle',
  summary:
    'In accordance with public-sector transparency mandates, municipal operations, public works tenders, and grievance audit logs are maintained for citizen scrutiny.',
  summaryKey: 'rtiSummary',
  guidelines: [
    'Public Information Officer (PIO) nodal contact available at Central Municipal Zone desk.',
    'Grievance audit trail documents, reference IDs, and departmental resolution logs may be requested.',
    'Standard statutory response timelines apply as per prevailing Right to Information rules.',
    'For proactive disclosure and budget inquiries, consult the municipal administrative portal.',
  ],
  guidelineKeys: [
    'rtiGuideline1',
    'rtiGuideline2',
    'rtiGuideline3',
    'rtiGuideline4',
  ],
}
