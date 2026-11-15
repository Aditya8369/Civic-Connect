
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { useLanguage } from '@/contexts/LanguageContext'
import {
  FileText,
  Activity,
  Users,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle,
} from 'lucide-react'

const STEPS = [
  {
    stepNumber: 1,
    titleKey: 'onboardingReportTitle',
    descriptionKey: 'onboardingReportDescription',
    icon: FileText,
    actionLabelKey: 'onboardingReportAction',
    actionRoute: '/report',
    accentColor:
      'text-primary-600 dark:text-primary-400 bg-primary-100 dark:bg-primary-950/60',
  },
  {
    stepNumber: 2,
    titleKey: 'onboardingTrackTitle',
    descriptionKey: 'onboardingTrackDescription',
    icon: Activity,
    actionLabelKey: 'onboardingTrackAction',
    actionRoute: '/my-reports',
    accentColor:
      'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60',
  },
  {
    stepNumber: 3,
    titleKey: 'onboardingConnectTitle',
    descriptionKey: 'onboardingConnectDescription',
    icon: Users,
    actionLabelKey: 'onboardingConnectAction',
    actionRoute: '/notifications',
    accentColor:
      'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60',
  },
]

function getOnboardingStorageKey(uid) {
  return `civic_onboarding_completed_${uid}`
}

export function CitizenOnboarding({
  className = '',
  forceShow = false,
  onComplete,
  onDismiss,
}) {
  const { user, loading } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [currentStep, setCurrentStep] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const storageKey = user?.uid
    ? getOnboardingStorageKey(user.uid)
    : null

  // Check persistent storage on user change
  useEffect(() => {
    if (!storageKey || forceShow) return

    try {
      const isCompleted = localStorage.getItem(storageKey) === 'true'
      setDismissed(isCompleted)
    } catch {
      // Ignore localStorage access failures
    }
  }, [storageKey, forceShow])

  const markCompleted = () => {
    setDismissed(true)

    if (storageKey) {
      try {
        localStorage.setItem(storageKey, 'true')
      } catch {
        // Ignore localStorage write failures
      }
    }
  }

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1)
    } else {
      markCompleted()
      onComplete?.()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1)
    }
  }

  const handleSkip = () => {
    markCompleted()
    onDismiss?.()
  }

  const handleStepAction = (route) => {
    markCompleted()
    onComplete?.()

    if (route) {
      navigate(route)
    }
  }

  // Hide while authentication is loading or when no authenticated user
  if (loading || !user) {
    return null
  }

  // Display only to citizens
  if (user.role !== 'citizen') {
    return null
  }

  // Hide if already completed or dismissed
  if (dismissed && !forceShow) {
    return null
  }

  const step = STEPS[currentStep]
  const IconComponent = step.icon
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === STEPS.length - 1

  return (
    <Card
      className={`relative mb-8 overflow-hidden border-primary-200/80 bg-gradient-to-br from-primary-50/60 via-white to-blue-50/40 shadow-sm dark:border-primary-900/50 dark:from-primary-950/30 dark:via-gray-900 dark:to-blue-950/20 ${className}`}
      role="region"
      aria-label={t('citizenOnboardingGuide')}
    >
      {/* Top Banner Accent Line */}
      <div className="h-1.5 w-full bg-gradient-to-r from-primary-500 via-sky-400 to-emerald-500" />

      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-primary-300 bg-white/80 text-primary-700 font-semibold text-xs dark:border-primary-800 dark:bg-gray-900/80 dark:text-primary-300"
            >
              {t('step')} {step.stepNumber} {t('of')} {STEPS.length}
            </Badge>

            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:inline">
              {t('welcomeToCivicConnect')}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="h-8 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              {t('skip')}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleSkip}
              aria-label={t('dismissOnboarding')}
              className="h-8 w-8 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Step Content */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${step.accentColor} shadow-inner`}
          >
            <IconComponent className="h-7 w-7" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
              {t(step.titleKey)}
            </h3>

            <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {t(step.descriptionKey)}
            </p>

            {step.actionLabelKey && (
              <Button
                variant="link"
                size="sm"
                onClick={() => handleStepAction(step.actionRoute)}
                className="mt-1.5 p-0 h-auto text-xs font-semibold text-primary-600 dark:text-primary-400"
              >
                {t(step.actionLabelKey)} &rarr;
              </Button>
            )}
          </div>
        </div>

        {/* Footer Navigation Controls */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-100 dark:border-gray-800/80">
          {/* Step Dots */}
          <div
            className="flex items-center gap-1.5 order-2 sm:order-1"
            aria-label={`${t('step')} ${currentStep + 1} ${t('of')} ${STEPS.length}`}
          >
            {STEPS.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setCurrentStep(index)}
                aria-label={`${t('goToStep')} ${index + 1}`}
                aria-current={index === currentStep ? 'step' : undefined}
                className={`h-2 rounded-full transition-all duration-200 ${
                  index === currentStep
                    ? 'w-6 bg-primary-600 dark:bg-primary-500'
                    : 'w-2 bg-gray-300 dark:bg-gray-700 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end order-1 sm:order-2">
            {!isFirstStep && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                className="gap-1 h-9 text-xs"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('previous')}
              </Button>
            )}

            {isLastStep ? (
              <Button
                size="sm"
                onClick={handleNext}
                className="gap-1.5 h-9 text-xs bg-primary-600 hover:bg-primary-700 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                {t('getStarted')}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleNext}
                className="gap-1 h-9 text-xs"
              >
                {t('next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default CitizenOnboarding
