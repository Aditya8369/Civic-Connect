import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Landmark,
  ShieldCheck,
  Clock,
  MapPin,
  Mail,
  Phone,
  ChevronRight,
  ExternalLink,
  BookOpen,
  Info,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { DEFAULT_MUNICIPAL_WARDS } from '@/utils/spotlightSearch'
import {
  DEFAULT_OFFICE_HOURS,
  MUNICIPAL_CONTACT_INFO,
  MUNICIPAL_DIRECTORY_INFO,
  MUNICIPAL_SLA_SUMMARY,
  CITIZEN_CHARTER_DETAILS,
  RTI_CHARTER_DETAILS,
} from '@/data/municipalData'
import { BackToTop } from '@/components/common/BackToTop'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export function Footer({
  wards = DEFAULT_MUNICIPAL_WARDS,
  officeHours = DEFAULT_OFFICE_HOURS,
  contactInfo = MUNICIPAL_CONTACT_INFO,
  slaSummary = MUNICIPAL_SLA_SUMMARY,
  showBackToTop = true,
  className,
}) {
  const currentYear = new Date().getFullYear()

  // Modal dialog states
  const [activeModal, setActiveModal] = useState(null) // 'charter' | 'rti' | 'wards' | null

  const hasWards = Array.isArray(wards) && wards.length > 0
  const hasOfficeHours = Boolean(officeHours)

  return (
    <footer
      className={cn(
        'relative border-t border-slate-800 bg-slate-900 text-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400',
        className
      )}
      aria-label="Municipal Portal Footer"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* =========================================================================
              COLUMN 1: About Municipal Desk
             ========================================================================= */}
          <div className="flex flex-col space-y-4">
            {/* Branding Header */}
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shadow-md ring-1 ring-white/10">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white">
                  CivicConnect
                </span>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary-400">
                  Municipal Grievance Portal
                </p>
              </div>
            </div>

            {/* Introduction & Purpose */}
            <p className="text-sm leading-relaxed text-slate-300 dark:text-slate-400">
              CivicConnect is the official digital civic engagement and grievance
              redressal platform for municipal corporation services. We provide
              a transparent bridge between citizens and city administration.
            </p>

            <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
              Enabling residents to register public complaints, track resolution
              milestones in real time, and enforce time-bound accountability across
              all municipal departments and local ward offices.
            </p>

            {/* Municipal Identity Badge */}
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 dark:border-slate-800/80 dark:bg-slate-900/60">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>Urban Local Governance &amp; Public Works Desk</span>
            </div>
          </div>

          {/* =========================================================================
              COLUMN 2: Quick Citizen Links
             ========================================================================= */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              Quick Citizen Links
            </h3>
            <p className="text-xs text-slate-400">
              Direct access to verified municipal portal services and personal complaint tracking.
            </p>

            <nav aria-label="Quick citizen links" className="flex flex-col space-y-2 pt-1">
              <Link
                to="/report"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>File a Grievance</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/my-reports"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Track Complaint</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/dashboard"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Citizen Dashboard</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/my-reports"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Grievance History</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/notifications"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Citizen Notifications</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/help"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Help &amp; Support Desk</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>

              <Link
                to="/profile"
                className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Citizen Profile &amp; Civic Karma</span>
                <ChevronRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100" aria-hidden="true" />
              </Link>
            </nav>
          </div>

          {/* =========================================================================
              COLUMN 3: Zonal Office Hours & Ward Directory
             ========================================================================= */}
          <div className="flex flex-col space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              Zonal Office Hours
            </h3>

            {/* Office Hours Section */}
            {hasOfficeHours ? (
              <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-white">
                  <Clock className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>
                    Office Hours {officeHours.isSample ? '(Sample / Reference)' : ''}
                  </span>
                </div>
                <div className="space-y-1 text-[11px] text-slate-300 dark:text-slate-400">
                  <p className="flex justify-between">
                    <span className="text-slate-400">Weekdays:</span>
                    <span className="font-medium text-slate-200">{officeHours.weekdays}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-400">Saturday:</span>
                    <span className="font-medium text-slate-200">{officeHours.saturday}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-slate-400">Sunday / Holidays:</span>
                    <span className="font-medium text-slate-300">{officeHours.sunday}</span>
                  </p>
                </div>
                {officeHours.disclaimer && (
                  <p className="mt-2 text-[10px] italic text-slate-400 dark:text-slate-500">
                    *{officeHours.disclaimer}
                  </p>
                )}
              </div>
            ) : null}

            {/* Municipal Zones & Ward Directory Section */}
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
              <div className="mb-1.5 flex items-center justify-between font-semibold text-white">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>Municipal Wards &amp; Jurisdiction</span>
                </div>
                {hasWards && (
                  <button
                    type="button"
                    onClick={() => setActiveModal('wards')}
                    className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                    aria-label="View complete Ward Directory"
                  >
                    View Directory
                  </button>
                )}
              </div>

              {hasWards ? (
                <div>
                  <p className="text-[11px] text-slate-300 dark:text-slate-400">
                    Central Municipal Zone ({wards.length} Wards Active)
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {wards.slice(0, 6).map((ward) => (
                      <span
                        key={ward}
                        className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-300"
                      >
                        {ward}
                      </span>
                    ))}
                    {wards.length > 6 && (
                      <span className="inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                        +{wards.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
                  Ward directory data unavailable for unconfigured sectors. Contact your zonal administrative desk.
                </p>
              )}
            </div>

            {/* Contact Information */}
            {contactInfo && (
              <div className="space-y-1.5 text-xs text-slate-300 dark:text-slate-400">
                {contactInfo.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <a
                      href={`mailto:${contactInfo.email}`}
                      className="hover:text-white hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                    >
                      {contactInfo.email}
                    </a>
                  </div>
                )}
                {contactInfo.onlineDesk && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    <span>{contactInfo.onlineDesk}</span>
                  </div>
                )}
                {contactInfo.helpline && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>
                      Helpline: <strong className="font-mono text-white">{contactInfo.helpline}</strong>
                    </span>
                  </div>
                )}
                {contactInfo.disclaimer && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    *{contactInfo.disclaimer}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* =========================================================================
              COLUMN 4: Legal / RTI / Citizen Charter
             ========================================================================= */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              Legal &amp; Citizen Charter
            </h3>
            <p className="text-xs text-slate-400">
              Statutory redressal commitments, transparency guidelines, and municipal regulations.
            </p>

            {/* Verified Grievance Redressal SLA Summary */}
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
              <div className="mb-2 flex items-center justify-between font-semibold text-white">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>Grievance Redressal SLA</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveModal('charter')}
                  className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                  aria-label="View Grievance Redressal Citizen Charter"
                >
                  Details
                </button>
              </div>

              <ul className="space-y-1 text-[11px]">
                {slaSummary.slice(0, 4).map((item) => (
                  <li key={item.category} className="flex items-center justify-between">
                    <span className="text-slate-300 dark:text-slate-400">{item.category}</span>
                    <span className="font-mono font-medium text-primary-400">{item.duration}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal & RTI Navigation Links */}
            <nav aria-label="Legal and RTI links" className="flex flex-col space-y-1.5 pt-1">
              <Link
                to="/help"
                className="flex items-center justify-between rounded py-0.5 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Citizen Charter</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </Link>

              <div className="flex items-center justify-between rounded py-0.5">
                <Link
                  to="/help"
                  className="flex items-center gap-1.5 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <span>Right to Information (RTI)</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => setActiveModal('rti')}
                  className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                  aria-label="View RTI guidelines and nodal information"
                >
                  Guidelines
                </button>
              </div>

              <Link
                to="/help"
                className="flex items-center justify-between rounded py-0.5 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Privacy Policy</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </Link>

              <Link
                to="/help"
                className="flex items-center justify-between rounded py-0.5 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <span>Terms and Conditions</span>
                <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </div>

        {/* =========================================================================
            BOTTOM BAR: Copyright, Accessibility & Status
           ========================================================================= */}
        <div className="mt-12 border-t border-slate-800/80 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center md:text-left">
              &copy; {currentYear} CivicConnect Municipal Corporation. All rights reserved.
              <span className="hidden md:inline"> &bull; </span>
              <span className="block md:inline mt-1 md:mt-0">
                Official municipal grievance redressal &amp; urban civic monitoring portal.
              </span>
            </p>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                <span>Portal Operational</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-slate-300">SLA Monitored</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          ACCESSIBLE MODAL DIALOGS
         ========================================================================= */}

      {/* 1. Ward Directory Dialog */}
      <Dialog open={activeModal === 'wards'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <MapPin className="h-5 w-5 text-primary-600" aria-hidden="true" />
              Municipal Ward Directory
            </DialogTitle>
            <DialogDescription>
              Active ward coverage and administrative jurisdiction under the Municipal Corporation portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Supported Municipal Wards
                </h4>
                <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {hasWards ? `${wards.length} Wards Configured` : '0 Wards'}
                </span>
              </div>
              {hasWards ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 pt-2">
                  {wards.map((ward) => (
                    <div
                      key={ward}
                      className="flex items-center justify-center rounded-md border border-gray-200 bg-white py-2 text-xs font-medium text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    >
                      {ward}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No ward directory data is currently configured for this portal.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {MUNICIPAL_DIRECTORY_INFO.description}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 2. Citizen Charter & Grievance SLA Dialog */}
      <Dialog open={activeModal === 'charter'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {CITIZEN_CHARTER_DETAILS.title}
            </DialogTitle>
            <DialogDescription>{CITIZEN_CHARTER_DETAILS.summary}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Statutory Redressal SLA Deadlines
              </h4>
              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Civic Category</th>
                      <th className="px-3 py-2 font-semibold">Target SLA</th>
                      <th className="px-3 py-2 font-semibold hidden sm:table-cell">Scope</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {slaSummary.map((item) => (
                      <tr key={item.category}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {item.category}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-primary-600 dark:text-primary-400">
                          {item.duration}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {item.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Key Charter Commitments
              </h4>
              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                {CITIZEN_CHARTER_DETAILS.commitments.map((commitment, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="font-bold text-primary-600 dark:text-primary-400">&bull;</span>
                    <span>{commitment}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 3. Right to Information (RTI) Dialog */}
      <Dialog open={activeModal === 'rti'} onOpenChange={(open) => !open && setActiveModal(null)}>
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {RTI_CHARTER_DETAILS.title}
            </DialogTitle>
            <DialogDescription>{RTI_CHARTER_DETAILS.summary}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Public Records &amp; Transparency Guidelines
              </h4>
              <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                {RTI_CHARTER_DETAILS.guidelines.map((guideline, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="font-bold text-primary-600 dark:text-primary-400">&bull;</span>
                    <span>{guideline}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Back to Top Button */}
      {showBackToTop && <BackToTop />}
    </footer>
  )
}

export default Footer
