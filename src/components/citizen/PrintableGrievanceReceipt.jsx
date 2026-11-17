
import { useMemo } from 'react'
import QRCode from 'qrcode'
import {
  Flag,
  MapPin,
  CheckCircle2,
  FileText,
  User,
  Building2,
} from 'lucide-react'
import { getDisplayId } from '@/firebase/complaintId'
import { getSlaTargetDate } from '@/utils/sla'
import { useLanguage } from '@/contexts/LanguageContext'

export function formatReceiptDate(ts, language = 'en') {
  if (!ts) return '-'

  let date = null

  if (typeof ts?.toDate === 'function') {
    date = ts.toDate()
  } else if (ts instanceof Date) {
    date = ts
  } else if (typeof ts?.seconds === 'number') {
    date = new Date(ts.seconds * 1000)
  } else if (typeof ts === 'number' || typeof ts === 'string') {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) date = d
  }

  if (!date || isNaN(date.getTime())) return '-'

  return date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getComplaintTrackingUrl(complaint) {
  const reference = complaint?.complaintId || complaint?.id || ''
  if (!reference) return ''

  let origin = 'https://civicconnect.local'

  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    !window.location.origin.includes('null')
  ) {
    origin = window.location.origin
  }

  return `${origin}/complaints/${reference}`
}

export function ReceiptQrCode({ value, size = 132, className = '' }) {
  const qrData = useMemo(() => {
    if (!value) return null

    try {
      const createFn = QRCode?.create || QRCode?.default?.create
      if (typeof createFn !== 'function') return null

      const qr = createFn(value, { errorCorrectionLevel: 'M' })
      const modCount = qr.modules.size
      const margin = 2
      const total = modCount + margin * 2

      let path = ''

      for (let r = 0; r < modCount; r++) {
        for (let c = 0; c < modCount; c++) {
          if (qr.modules.get(r, c)) {
            path += `M${c + margin},${r + margin}h1v1h-1z `
          }
        }
      }

      return { total, path }
    } catch (err) {
      console.error('Failed to generate receipt QR code:', err)
      return null
    }
  }, [value])

  if (!qrData) {
    return (
      <div
        data-testid="receipt-qr-fallback"
        className={`flex items-center justify-center border border-dashed border-slate-300 bg-slate-50 text-[11px] text-slate-500 ${className}`}
        style={{ width: size, height: size }}
      >
        QR Unavailable
      </div>
    )
  }

  return (
    <svg
      role="img"
      aria-label="Verification QR Code"
      data-testid="receipt-qr-code"
      viewBox={`0 0 ${qrData.total} ${qrData.total}`}
      width={size}
      height={size}
      className={`bg-white ${className}`}
      shapeRendering="crispEdges"
      style={{ shapeRendering: 'crispEdges' }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={qrData.total} height={qrData.total} fill="#ffffff" />
      <path d={qrData.path} fill="#0f172a" />
    </svg>
  )
}

export function PrintableGrievanceReceipt({
  complaint,
  citizen,
  user,
  issuedAt,
  className = '',
}) {
  const { t, language } = useLanguage()

  if (!complaint) return null

  const displayId = getDisplayId(complaint)
  const trackingUrl = getComplaintTrackingUrl(complaint)
  const submissionDate = formatReceiptDate(complaint.createdAt, language)
  const printDate = formatReceiptDate(issuedAt || new Date(), language)

  const slaTarget = getSlaTargetDate(
    complaint.createdAt,
    complaint.category,
    complaint.department
  )

  const slaTargetFormatted = slaTarget
    ? formatReceiptDate(slaTarget, language)
    : t('receiptStandardSla')

  const isOwner = user?.uid && complaint?.reportedBy === user.uid
  const isAdmin = user?.role === 'admin'
  const isAuthorized = isOwner || isAdmin || !complaint?.reportedBy

  const citizenName =
    (isAuthorized &&
      (citizen?.name ||
        complaint.citizenName ||
        (isOwner ? user?.name : null))) ||
    t('receiptRegisteredCitizen')

  const citizenEmail = isAuthorized
    ? citizen?.email || complaint.userEmail || (isOwner ? user?.email : null)
    : null

  const citizenPhone = isAuthorized
    ? citizen?.phone || complaint.phone
    : null

  const citizenAddress = isAuthorized
    ? citizen?.address || complaint.citizenAddress
    : null

  const departmentName =
    complaint.department?.trim() || t('receiptMunicipalGrievanceCell')

  const statusKey = {
    Pending: 'statusPending',
    'In Progress': 'statusInProgress',
    Resolved: 'statusResolved',
    Rejected: 'statusRejected',
    Reopened: 'statusReopened',
    'Merged - Duplicate': 'statusMerged',
  }[complaint.status || 'Pending']

  const status = statusKey
    ? t(statusKey).toUpperCase()
    : (complaint.status || t('statusPending')).toUpperCase()

  return (
    <div
      data-testid="printable-grievance-receipt"
      className={`printable-receipt bg-white text-slate-900 font-sans p-6 sm:p-8 max-w-4xl mx-auto border-2 border-slate-800 rounded-md print:border-2 print:border-slate-800 print:p-6 print:m-0 print:max-w-none print:w-full print:rounded-none ${className}`}
    >
      <header className="border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0 print:bg-slate-900">
              <Flag className="h-6 w-6 text-white" />
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wider uppercase text-slate-600">
                CivicConnect Municipal Corporation
              </p>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 uppercase">
                {t('receiptTitle')}
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                {t('receiptSubtitle')}
              </p>
            </div>
          </div>

          <div className="text-right text-xs shrink-0">
            <div className="inline-block border border-slate-300 rounded px-2 py-1 bg-slate-50 font-mono text-[11px] mb-1">
              {t('receiptOriginalCopy')}
            </div>

            <p className="text-slate-500">
              {t('receiptDate')}:{' '}
              <span className="font-semibold text-slate-800">{printDate}</span>
            </p>

            {complaint.ward && (
              <p className="text-slate-500">
                {t('receiptWardOffice')}:{' '}
                <span className="font-medium text-slate-800">
                  {complaint.ward}
                </span>
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="bg-slate-50 border border-slate-300 rounded p-3 mb-5 print-avoid-break">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 uppercase tracking-wider block text-[10px] font-semibold">
              {t('receiptReferenceId')}
            </span>
            <span
              data-testid="receipt-complaint-id"
              className="text-base sm:text-lg font-mono font-bold text-slate-900 tracking-wide"
            >
              {displayId}
            </span>
          </div>

          <div>
            <span className="text-slate-500 uppercase tracking-wider block text-[10px] font-semibold">
              {t('receiptFilingDate')}
            </span>
            <span
              data-testid="receipt-submission-date"
              className="font-medium text-slate-800 text-sm mt-0.5 block"
            >
              {submissionDate}
            </span>
          </div>

          <div>
            <span className="text-slate-500 uppercase tracking-wider block text-[10px] font-semibold">
              {t('receiptCurrentStatus')}
            </span>
            <span
              data-testid="receipt-status"
              className="inline-block mt-0.5 px-2 py-0.5 rounded font-bold text-xs uppercase tracking-wide border border-slate-400 bg-white text-slate-900"
            >
              {status}
            </span>
          </div>

          <div>
            <span className="text-slate-500 uppercase tracking-wider block text-[10px] font-semibold">
              {t('receiptSlaTarget')}
            </span>
            <span className="font-medium text-slate-800 text-sm mt-0.5 block">
              {slaTargetFormatted}
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5 print-avoid-break">
        <section className="border border-slate-200 rounded p-3.5 bg-white">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-200 mb-2.5 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-slate-600" />
            {t('receiptCitizenInformation')}
          </h2>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptCitizenName')}:</dt>
              <dd data-testid="receipt-citizen-name" className="font-medium text-slate-900 text-right">
                {citizenName}
              </dd>
            </div>

            {citizenEmail && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t('email')}:</dt>
                <dd data-testid="receipt-citizen-email" className="font-mono text-slate-800 text-right">
                  {citizenEmail}
                </dd>
              </div>
            )}

            {citizenPhone && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t('receiptContactPhone')}:</dt>
                <dd data-testid="receipt-citizen-phone" className="font-mono text-slate-800 text-right">
                  {citizenPhone}
                </dd>
              </div>
            )}

            {citizenAddress && (
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">{t('receiptCitizenAddress')}:</dt>
                <dd className="font-medium text-slate-800 text-right max-w-[65%]">
                  {citizenAddress}
                </dd>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptFilerAuthorization')}:</dt>
              <dd className="text-slate-700 font-medium">
                {isAuthorized
                  ? t('receiptVerifiedFiler')
                  : t('receiptConfidential')}
              </dd>
            </div>
          </dl>
        </section>

        <section className="border border-slate-200 rounded p-3.5 bg-white">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-200 mb-2.5 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-slate-600" />
            {t('receiptDepartmentClassification')}
          </h2>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptAssignedDepartment')}:</dt>
              <dd data-testid="receipt-department" className="font-semibold text-slate-900 text-right">
                {departmentName}
              </dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptGrievanceCategory')}:</dt>
              <dd data-testid="receipt-category" className="font-medium text-slate-800 text-right">
                {complaint.category || t('receiptGeneral')}
              </dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptJurisdictionWard')}:</dt>
              <dd className="font-medium text-slate-800 text-right">
                {complaint.ward || t('receiptCentralMunicipalZone')}
              </dd>
            </div>

            <div className="flex justify-between gap-2">
              <dt className="text-slate-500">{t('receiptEvidenceAttached')}:</dt>
              <dd className="text-slate-700">
                {complaint.imageUrl || (complaint.photos && complaint.photos.length > 0)
                  ? t('receiptPhotoEvidence')
                  : t('none')}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="border border-slate-200 rounded p-4 mb-5 bg-white print-avoid-break">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 pb-2 border-b border-slate-200 mb-3 flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-slate-600" />
          {t('receiptGrievanceDetails')}
        </h2>

        <div className="space-y-3 text-xs">
          <div>
            <span className="font-semibold text-slate-600 block mb-0.5">
              {t('title')}:
            </span>
            <p data-testid="receipt-title" className="text-sm font-bold text-slate-900">
              {complaint.title || '-'}
            </p>
          </div>

          <div>
            <span className="font-semibold text-slate-600 block mb-0.5">
              {t('description')}:
            </span>
            <p
              data-testid="receipt-description"
              className="text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50 p-2.5 rounded border border-slate-100"
            >
              {complaint.description || t('noDescriptionProvided')}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <span className="text-slate-500">
                  {t('receiptIncidentLocation')}:{' '}
                </span>
                <span data-testid="receipt-address" className="font-medium text-slate-900">
                  {complaint.address || t('receiptLocationCoordinates')}
                </span>
              </div>
            </div>

            {complaint.latitude && complaint.longitude && (
              <span className="font-mono text-[11px] text-slate-500 shrink-0">
                GPS: {complaint.latitude}, {complaint.longitude}
              </span>
            )}
          </div>
        </div>
      </section>

      <section
        data-testid="receipt-verification-section"
        className="border-2 border-slate-800 rounded p-4 mb-5 bg-slate-50 print-avoid-break"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="p-1.5 bg-white border border-slate-300 rounded shadow-sm shrink-0">
            <ReceiptQrCode value={trackingUrl} size={118} />
          </div>

          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">
                {t('receiptDigitalVerification')}
              </h3>
            </div>

            <p className="text-xs font-semibold text-slate-800">
              {t('receiptScanToVerify')}
            </p>

            <p className="text-[11px] text-slate-600 leading-normal">
              {t('receiptQrInstructions')}
            </p>

            <div className="pt-1">
              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">
                {t('receiptTrackingUrl')}:
              </span>
              <p
                data-testid="receipt-tracking-url"
                className="font-mono text-[11px] text-slate-800 break-all select-all font-medium"
              >
                {trackingUrl}
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-300 pt-4 text-[11px] text-slate-600 print-avoid-break">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-4">
          <div>
            <p className="font-semibold text-slate-700 mb-8">
              {t('receiptCitizenAcknowledgment')}:
            </p>
            <div className="border-b border-dashed border-slate-400 w-full mb-1" />
            <p className="text-[10px] text-slate-500">
              {t('receiptSignatureDate')}
            </p>
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-8">
              {t('receiptReceivingAuthority')}:
            </p>
            <div className="border-b border-dashed border-slate-400 w-full mb-1" />
            <p className="text-[10px] text-slate-500">
              {t('receiptIntakeOfficer')}
            </p>
          </div>

          <div className="col-span-2 sm:col-span-1 text-center sm:text-right">
            <div className="inline-block border border-dashed border-slate-400 rounded px-4 py-3 text-center bg-slate-50">
              <p className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">
                {t('receiptMunicipalSeal')}
              </p>
              <p className="text-[9px] text-slate-400 mt-1">
                {t('receiptPhysicalStamp')}
              </p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 border-t border-slate-200 pt-2 text-center leading-normal">
          {t('receiptFooterText')}{' '}
          <strong className="font-mono text-slate-800">{displayId}</strong>{' '}
          {t('receiptFooterFollowUp')}
        </p>
      </footer>
    </div>
  )
}
