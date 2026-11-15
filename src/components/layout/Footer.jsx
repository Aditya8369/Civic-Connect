
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
import { useLanguage } from '@/contexts/LanguageContext'
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
  const { t } = useLanguage()

  const [activeModal, setActiveModal] = useState(null)

  const hasWards = Array.isArray(wards) && wards.length > 0
  const hasOfficeHours = Boolean(officeHours)

  const quickLinks = [
    { to: '/report', label: 'footerFileGrievance' },
    { to: '/my-reports', label: 'footerTrackComplaint' },
    { to: '/dashboard', label: 'footerCitizenDashboard' },
    { to: '/my-reports', label: 'footerGrievanceHistory' },
    { to: '/notifications', label: 'footerCitizenNotifications' },
    { to: '/help', label: 'footerHelpSupport' },
    { to: '/profile', label: 'footerCitizenProfile' },
  ]

  const legalLinks = [
    { to: '/help', label: 'footerCitizenCharter' },
    { to: '/help', label: 'footerRTI' },
    { to: '/help', label: 'footerPrivacyPolicy' },
    { to: '/help', label: 'footerTerms' },
  ]

  return (
    <footer
      className={cn(
        'relative border-t border-slate-800 bg-slate-900 text-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400',
        className
      )}
      aria-label={t('footerMunicipalPortal')}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">

          {/* About */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shadow-md ring-1 ring-white/10">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight text-white">
                  CivicConnect
                </span>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary-400">
                  {t('footerMunicipalPortal')}
                </p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300 dark:text-slate-400">
              {t('footerAboutDescription')}
            </p>

            <p className="text-xs leading-relaxed text-slate-400 dark:text-slate-500">
              {t('footerAboutDetails')}
            </p>

            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-xs text-slate-300 dark:border-slate-800/80 dark:bg-slate-900/60">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              <span>{t('footerGovernanceDesk')}</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              {t('footerQuickLinks')}
            </h3>
            <p className="text-xs text-slate-400">
              {t('footerQuickLinksDescription')}
            </p>

            <nav aria-label={t('footerQuickLinks')} className="flex flex-col space-y-2 pt-1">
              {quickLinks.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="group flex items-center justify-between rounded py-1 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <span>{t(item.label)}</span>
                  <ChevronRight
                    className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-1 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </nav>
          </div>

          {/* Office Hours and Wards */}
          <div className="flex flex-col space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              {t('footerOfficeHours')}
            </h3>

            {hasOfficeHours && (
              <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
                <div className="mb-2 flex items-center gap-1.5 font-semibold text-white">
                  <Clock className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>
                    {officeHours.titleKey
                      ? t(officeHours.titleKey)
                      : officeHours.title || t('footerOfficeHours')}
                    {officeHours.isSample ? ` (${t('footerSampleReference')})` : ''}
                  </span>
                </div>

                <div className="space-y-1 text-[11px] text-slate-300 dark:text-slate-400">
                  <p className="flex justify-between">
                    <span className="text-slate-400">{t('footerWeekdays')}:</span>
                    <span className="font-medium text-slate-200">
                      {officeHours.weekdaysKey
                        ? t(officeHours.weekdaysKey)
                        : officeHours.weekdays}
                    </span>
                  </p>

                  <p className="flex justify-between">
                    <span className="text-slate-400">{t('footerSaturday')}:</span>
                    <span className="font-medium text-slate-200">
                      {officeHours.saturdayKey
                        ? t(officeHours.saturdayKey)
                        : officeHours.saturday}
                    </span>
                  </p>

                  <p className="flex justify-between">
                    <span className="text-slate-400">{t('footerSundayHolidays')}:</span>
                    <span className="font-medium text-slate-300">
                      {officeHours.sundayKey
                        ? t(officeHours.sundayKey)
                        : officeHours.sunday}
                    </span>
                  </p>
                </div>

                {officeHours.disclaimer && (
                  <p className="mt-2 text-[10px] italic text-slate-400 dark:text-slate-500">
                    *
                    {officeHours.disclaimerKey
                      ? t(officeHours.disclaimerKey)
                      : officeHours.disclaimer}
                  </p>
                )}
              </div>
            )}

            {/* Ward Directory */}
            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
              <div className="mb-1.5 flex items-center justify-between font-semibold text-white">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>{t('footerWardsJurisdiction')}</span>
                </div>

                {hasWards && (
                  <button
                    type="button"
                    onClick={() => setActiveModal('wards')}
                    className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                    aria-label={t('footerViewWardDirectory')}
                  >
                    {t('footerViewDirectory')}
                  </button>
                )}
              </div>

              {hasWards ? (
                <div>
                  <p className="text-[11px] text-slate-300 dark:text-slate-400">
                    {t('footerCentralZone')} ({wards.length} {t('footerWardsActive')})
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
                        +{wards.length - 6} {t('footerMore')}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400 dark:text-slate-500">
                  {t('footerWardUnavailable')}
                </p>
              )}
            </div>

            {/* Contact */}
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
                    <span>
                      {contactInfo.onlineDeskKey
                        ? t(contactInfo.onlineDeskKey)
                        : contactInfo.onlineDesk}
                    </span>
                  </div>
                )}

                {contactInfo.helpline && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>
                      {t('footerHelpline')}:{' '}
                      <strong className="font-mono text-white">
                        {contactInfo.helpline}
                      </strong>
                    </span>
                  </div>
                )}

                {contactInfo.disclaimer && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    *
                    {contactInfo.disclaimerKey
                      ? t(contactInfo.disclaimerKey)
                      : contactInfo.disclaimer}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Legal and SLA */}
          <div className="flex flex-col space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white">
              {t('footerLegalTitle')}
            </h3>

            <p className="text-xs text-slate-400">
              {t('footerLegalDescription')}
            </p>

            <div className="rounded-lg border border-slate-800 bg-slate-800/40 p-3 text-xs text-slate-300 dark:bg-slate-900/40">
              <div className="mb-2 flex items-center justify-between font-semibold text-white">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary-400" aria-hidden="true" />
                  <span>{t('footerGrievanceSla')}</span>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModal('charter')}
                  className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                  aria-label={t('footerViewCharter')}
                >
                  {t('footerDetails')}
                </button>
              </div>

              <ul className="space-y-1 text-[11px]">
                {slaSummary.slice(0, 4).map((item) => (
                  <li key={item.category} className="flex items-center justify-between gap-2">
                    <span className="text-slate-300 dark:text-slate-400">
                      {item.categoryKey ? t(item.categoryKey) : item.category}
                    </span>
                    <span className="font-mono font-medium text-primary-400">
                      {item.duration}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <nav aria-label={t('footerLegalLinks')} className="flex flex-col space-y-1.5 pt-1">
              {legalLinks.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  className="flex items-center justify-between rounded py-0.5 text-sm text-slate-300 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <span>{t(item.label)}</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                </Link>
              ))}

              <div className="flex items-center justify-between rounded py-0.5">
                <span className="text-sm text-slate-300 dark:text-slate-400">
                  {t('footerRTI')}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveModal('rti')}
                  className="text-[11px] font-medium text-primary-400 hover:text-primary-300 underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400"
                  aria-label={t('footerViewRtiGuidelines')}
                >
                  {t('footerGuidelines')}
                </button>
              </div>
            </nav>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-slate-800/80 pt-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center md:text-left">
              &copy; {currentYear} CivicConnect Municipal Corporation.{' '}
              {t('footerAllRightsReserved')}
              <span className="hidden md:inline"> &bull; </span>
              <span className="block md:inline mt-1 md:mt-0">
                {t('footerCopyrightDescription')}
              </span>
            </p>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-800/80 px-3 py-1 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                <span>{t('footerPortalOperational')}</span>
                <span className="text-slate-500">&bull;</span>
                <span className="text-slate-300">{t('footerSlaMonitored')}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ward Directory Dialog */}
      <Dialog
        open={activeModal === 'wards'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <MapPin className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {t('footerWardDialogTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('footerWardDialogDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('footerSupportedWards')}
                </h4>

                <span className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {hasWards
                    ? `${wards.length} ${t('footerWardsConfigured')}`
                    : `0 ${t('footerWards')}`}
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
                  {t('footerNoWardData')}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {MUNICIPAL_DIRECTORY_INFO.descriptionKey
                  ? t(MUNICIPAL_DIRECTORY_INFO.descriptionKey)
                  : MUNICIPAL_DIRECTORY_INFO.description}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Citizen Charter Dialog */}
      <Dialog
        open={activeModal === 'charter'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {t(CITIZEN_CHARTER_DETAILS.titleKey)}
            </DialogTitle>
            <DialogDescription>
              {t(CITIZEN_CHARTER_DETAILS.summaryKey)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {t('footerSlaDeadlines')}
              </h4>

              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    <tr>
                      <th className="px-3 py-2 font-semibold">{t('footerCivicCategory')}</th>
                      <th className="px-3 py-2 font-semibold">{t('footerTargetSla')}</th>
                      <th className="px-3 py-2 font-semibold hidden sm:table-cell">
                        {t('footerScope')}
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {slaSummary.map((item) => (
                      <tr key={item.category}>
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                          {item.categoryKey ? t(item.categoryKey) : item.category}
                        </td>
                        <td className="px-3 py-2 font-mono font-semibold text-primary-600 dark:text-primary-400">
                          {item.duration}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                          {item.descriptionKey
                            ? t(item.descriptionKey)
                            : item.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {t('footerCharterCommitments')}
              </h4>

              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                {CITIZEN_CHARTER_DETAILS.commitments.map((commitment, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="font-bold text-primary-600 dark:text-primary-400">&bull;</span>
                    <span>
                      {CITIZEN_CHARTER_DETAILS.commitmentKeys?.[index]
                        ? t(CITIZEN_CHARTER_DETAILS.commitmentKeys[index])
                        : commitment}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* RTI Dialog */}
      <Dialog
        open={activeModal === 'rti'}
        onOpenChange={(open) => !open && setActiveModal(null)}
      >
        <DialogContent className="max-w-2xl text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <ShieldCheck className="h-5 w-5 text-primary-600" aria-hidden="true" />
              {t(RTI_CHARTER_DETAILS.titleKey)}
            </DialogTitle>
            <DialogDescription>
              {t(RTI_CHARTER_DETAILS.summaryKey)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                {t('footerRtiGuidelinesHeading')}
              </h4>

              <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-300">
                {RTI_CHARTER_DETAILS.guidelines.map((guideline, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="font-bold text-primary-600 dark:text-primary-400">&bull;</span>
                    <span>
                      {RTI_CHARTER_DETAILS.guidelineKeys?.[index]
                        ? t(RTI_CHARTER_DETAILS.guidelineKeys[index])
                        : guideline}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showBackToTop && <BackToTop />}
    </footer>
  )
}

export default Footer
