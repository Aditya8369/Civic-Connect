

import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Copy, ArrowRight, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useLanguage } from '@/contexts/LanguageContext'

export function ComplaintConfirmationPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const complaintId = state?.complaintId
  const issueId = state?.issueId
  const title = state?.title

  useEffect(() => {
    if (!complaintId || !issueId) {
      navigate('/my-reports', { replace: true })
    }
  }, [complaintId, issueId, navigate])

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard access is unavailable')
      }

      await navigator.clipboard.writeText(complaintId)
      toast.success(t('complaintReferenceCopied'))
    } catch {
      toast.error(t('complaintCopyError'))
    }
  }

  if (!complaintId || !issueId) return null

  return (
    <div>
      <PageHeader
        title={t('complaintSubmitted')}
        description={t('complaintSubmittedDescription')}
      />

      <div className="max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-6 sm:p-8 space-y-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">
                {t('thankYouForReporting')}
              </h2>
              <p className="text-muted-foreground">
                {t('complaintSavedSuccessfully')}
              </p>
            </div>

            {title && (
              <div className="rounded-lg bg-muted p-4 text-left">
                <p className="text-sm text-muted-foreground">
                  {t('complaint')}
                </p>
                <p className="font-medium">{title}</p>
              </div>
            )}

            <div className="rounded-lg border p-5 space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('yourComplaintReferenceId')}
              </p>

              <p className="text-xl sm:text-2xl font-bold tracking-wide break-all">
                {complaintId}
              </p>

              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className="w-full"
              >
                <Copy className="h-4 w-4 mr-2" />
                {t('copyReferenceId')}
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                onClick={() => navigate(`/report/${issueId}`)}
                className="flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                {t('trackComplaint')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/my-reports')}
                className="flex-1"
              >
                {t('myReports')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
