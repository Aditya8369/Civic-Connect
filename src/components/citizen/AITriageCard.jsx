import { Sparkles, Check, X, AlertCircle, ArrowRight, ShieldAlert, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const SEVERITY_STYLES = {
  Urgent: {
    badge: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800',
    dot: 'bg-red-500',
    label: 'Urgent Severity',
  },
  High: {
    badge: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
    dot: 'bg-orange-500',
    label: 'High Severity',
  },
  Medium: {
    badge: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
    label: 'Medium Severity',
  },
  Low: {
    badge: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    dot: 'bg-blue-500',
    label: 'Low Severity',
  },
}

export function AITriageCard({
  triageResult,
  analyzing = false,
  onAccept,
  onApplyCategory,
  onApplyTitle,
  onApplyDescription,
  onDismiss,
  disabled = false,
  autoPopulated = false,
}) {
  if (analyzing) {
    return (
      <div
        data-testid="ai-triage-loading"
        className="p-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/50 dark:bg-primary-950/30 flex items-center gap-3 animate-pulse"
        role="status"
        aria-live="polite"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/50 text-primary-600 dark:text-primary-300">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-primary-900 dark:text-primary-100 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary-500 animate-spin" />
            AI Multimodal Vision Triage Active
          </p>
          <p className="text-xs text-primary-700/80 dark:text-primary-300/80 mt-0.5">
            Analyzing photo with Gemini 1.5 Flash Vision to predict category, severity, and draft details...
          </p>
        </div>
      </div>
    )
  }

  if (!triageResult) return null

  const {
    category,
    department,
    confidence = 0.85,
    severity = 'Medium',
    severityReason,
    suggestedTitle,
    suggestedDescription,
    source,
  } = triageResult

  const confidencePercent = Math.round(confidence * 100)
  const severityStyle = SEVERITY_STYLES[severity] || SEVERITY_STYLES.Medium

  return (
    <Card
      data-testid="ai-triage-card"
      role="region"
      aria-label="AI vision triage suggestion"
      className="overflow-hidden border-2 border-primary-300 dark:border-primary-700 bg-gradient-to-br from-primary-50/60 via-white to-amber-50/30 dark:from-primary-950/30 dark:via-gray-900 dark:to-amber-950/10 shadow-xs"
    >
      <CardContent className="p-4 sm:p-5 space-y-4">
        {/* Header bar */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-xs">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  AI Vision Triage Suggestion
                </span>
                <span
                  data-testid="triage-confidence-badge"
                  className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700"
                >
                  {confidencePercent}% confidence
                </span>
                {source === 'gemini' && (
                  <span className="text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-100/60 dark:bg-primary-900/40 px-1.5 py-0.2 rounded">
                    Gemini 1.5 Flash
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Automatically detected from your uploaded photograph
              </p>
            </div>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              disabled={disabled}
              aria-label="Dismiss AI suggestion"
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Suggested Category & Severity Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Category Recommendation */}
          <div className="p-3 rounded-lg border border-primary-200/80 dark:border-primary-800/80 bg-white/80 dark:bg-gray-900/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300 block mb-1">
              Recommended Category
            </span>
            <div className="flex items-center justify-between gap-2">
              <span data-testid="triage-recommended-category" className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {category}
              </span>
              <Badge variant="outline" className="text-[10px] shrink-0 font-semibold border-primary-300 text-primary-700 dark:text-primary-300">
                {department}
              </Badge>
            </div>
          </div>

          {/* Severity Recommendation */}
          <div className="p-3 rounded-lg border border-primary-200/80 dark:border-primary-800/80 bg-white/80 dark:bg-gray-900/80">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1">
              Estimated Severity
            </span>
            <div className="flex items-center gap-2">
              <span
                data-testid="triage-severity-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${severityStyle.badge}`}
              >
                <span className={`h-2 w-2 rounded-full ${severityStyle.dot}`} />
                {severity}
              </span>
              {severityReason && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {severityReason}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Draft Title & Description Preview */}
        {(suggestedTitle || suggestedDescription) && (
          <div className="p-3 rounded-lg bg-gray-50/80 dark:bg-gray-900/50 border border-gray-200/60 dark:border-gray-800/80 space-y-2">
            {suggestedTitle && (
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Suggested Title:
                </span>
                <p data-testid="triage-suggested-title" className="text-xs font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                  {suggestedTitle}
                </p>
              </div>
            )}
            {suggestedDescription && (
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Suggested Description:
                </span>
                <p data-testid="triage-suggested-description" className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 line-clamp-2">
                  {suggestedDescription}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Auto-populated notice or Action controls */}
        {autoPopulated && (
          <div
            data-testid="ai-auto-populated-notice"
            className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-200 dark:border-emerald-800"
          >
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              Draft details and category pre-filled from photo. You can edit, replace, or override any field.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200/60 dark:border-gray-800/60">
          <div className="flex items-center gap-1.5 flex-wrap">
            {onAccept && (
              <Button
                type="button"
                size="sm"
                data-testid="triage-accept-btn"
                className="gap-1.5 h-8 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white"
                onClick={onAccept}
                disabled={disabled}
              >
                <Check className="h-3.5 w-3.5" />
                Accept All Suggestions
              </Button>
            )}

            {onApplyCategory && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="triage-apply-category-btn"
                className="h-8 text-xs font-medium"
                onClick={onApplyCategory}
                disabled={disabled}
              >
                Use Category
              </Button>
            )}

            {onApplyTitle && suggestedTitle && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="triage-apply-title-btn"
                className="h-8 text-xs font-medium"
                onClick={onApplyTitle}
                disabled={disabled}
              >
                Use Title
              </Button>
            )}

            {onApplyDescription && suggestedDescription && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="triage-apply-desc-btn"
                className="h-8 text-xs font-medium"
                onClick={onApplyDescription}
                disabled={disabled}
              >
                Use Description
              </Button>
            )}
          </div>

          <span className="text-[11px] text-gray-500 dark:text-gray-400 italic">
            You can override the category dropdown at any time.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
