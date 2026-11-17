import { useMemo, useState } from 'react'
import {
  Award,
  ChevronDown,
  ChevronUp,
  Filter,
  MessageSquare,
  Smile,
  Star,
  ThumbsUp,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DepartmentCrest } from '@/components/common/DepartmentCrest'
import {
  calculateCsatMetrics,
  calculateDepartmentCsat,
  getCsatStatus,
} from '@/utils/csat'
import { useLanguage } from '@/contexts/LanguageContext'

const departmentTranslationKeys = {
  Roads: 'departmentRoads',
  Sanitation: 'departmentSanitation',
  Electricity: 'departmentElectricity',
  Water: 'departmentWater',
  'Public Safety': 'departmentPublicSafety',
}

function formatDate(ts, language) {
  if (!ts) return ''
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(language === 'hi' ? 'hi-IN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function StarRatingDisplay({ rating = 0 }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((starIndex) => (
        <Star
          key={starIndex}
          className={`h-4 w-4 ${
            starIndex <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700'
          }`}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

export function DepartmentCsatWidget({
  complaints = [],
  onSelectDepartment,
  className = '',
}) {
  const { t, language } = useLanguage()
  const [showComments, setShowComments] = useState(false)

  const overallMetrics = useMemo(
    () => calculateCsatMetrics(complaints),
    [complaints]
  )

  const departmentMetrics = useMemo(
    () => calculateDepartmentCsat(complaints),
    [complaints]
  )

  const csatStatus = getCsatStatus(
    overallMetrics.csatScore,
    overallMetrics.totalRated
  )

  const hasFeedback = overallMetrics.totalRated > 0
  const commentsList = overallMetrics.recentFeedback.filter(
    (item) => item.comment || (item.tags && item.tags.length > 0)
  )

  return (
    <Card className={`mb-6 overflow-hidden border-border/80 shadow-xs ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
              <Award className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold sm:text-lg text-foreground">
                {t('csatWidgetTitle')}
              </h2>
              <CardDescription className="text-xs sm:text-sm">
                {t('csatWidgetDescription')}
              </CardDescription>
            </div>
          </div>

          {hasFeedback && (
            <Badge
              variant={csatStatus.variant}
              className="text-xs font-medium px-2.5 py-1"
            >
              {csatStatus.label} • {t('feedbackScoreLabel').replace('{score}', String(overallMetrics.csatScore))}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-1">
        {!hasFeedback ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center dark:border-gray-800 dark:bg-gray-900/30">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
              <Smile className="h-6 w-6" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {t('noFeedbackYet')}
            </h4>
            <p className="mx-auto mt-1 max-w-md text-xs text-gray-500 dark:text-gray-400">
              {t('noFeedbackYetDescription')}
            </p>
          </div>
        ) : (
          <>
            {/* Top Metric Summary Bar */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Overall Score */}
              <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-4 shadow-2xs">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('netCsatScore')}
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold tracking-tight text-foreground">
                    {overallMetrics.csatScore}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({overallMetrics.positiveRatio}% {t('positiveSentiment')})
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{overallMetrics.positiveCount} satisfied ratings</span>
                </div>
              </div>

              {/* Average Star Rating */}
              <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-4 shadow-2xs">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('averageStarRating')}
                </span>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-3xl font-extrabold tracking-tight text-foreground">
                    {overallMetrics.averageRating}
                  </span>
                  <StarRatingDisplay rating={overallMetrics.averageRating} />
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Out of 5.0 stars across all departments
                </div>
              </div>

              {/* Total Submissions & Breakdown */}
              <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-card p-4 shadow-2xs">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('totalFeedbackSubmissions')}
                </span>
                <div className="mt-2 text-3xl font-extrabold tracking-tight text-foreground">
                  {overallMetrics.totalRated}
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    {overallMetrics.positiveCount} pos
                  </span>
                  •
                  <span className="text-amber-500 font-medium">
                    {overallMetrics.neutralCount} neu
                  </span>
                  •
                  <span className="text-rose-500 font-medium">
                    {overallMetrics.negativeCount} neg
                  </span>
                </div>
              </div>
            </div>

            {/* Tri-Color Sentiment Ratio Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Sentiment Distribution
                </span>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>{overallMetrics.positiveRatio}% {t('positiveSentiment')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span>{overallMetrics.neutralRatio}% {t('neutralSentiment')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>{overallMetrics.negativeRatio}% {t('negativeSentiment')}</span>
                  </span>
                </div>
              </div>

              <div
                className="flex h-3.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
                role="progressbar"
                aria-label="Sentiment distribution"
                aria-valuenow={overallMetrics.csatScore}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${overallMetrics.positiveRatio}%` }}
                  title={`Positive: ${overallMetrics.positiveRatio}%`}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${overallMetrics.neutralRatio}%` }}
                  title={`Neutral: ${overallMetrics.neutralRatio}%`}
                />
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${overallMetrics.negativeRatio}%` }}
                  title={`Negative: ${overallMetrics.negativeRatio}%`}
                />
              </div>
            </div>

            {/* Department Breakdown Grid */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('departmentBreakdown')}
              </h4>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {departmentMetrics.map((dept) => {
                  const status = getCsatStatus(dept.csatScore, dept.totalRated)
                  const deptKey = departmentTranslationKeys[dept.department] || dept.department
                  const deptName = t(deptKey)

                  return (
                    <div
                      key={dept.department}
                      className="flex flex-col justify-between rounded-xl border border-border/70 bg-card p-3.5 transition-colors hover:border-border"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <DepartmentCrest
                          department={dept.department}
                          size="sm"
                          showLabel={true}
                        />

                        {dept.totalRated > 0 ? (
                          <Badge
                            variant={status.variant}
                            className="text-[11px] font-semibold"
                          >
                            {dept.csatScore}% CSAT
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            No Ratings
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                          <span className="font-semibold text-foreground">
                            {dept.totalRated > 0 ? dept.averageRating : '-'}
                          </span>
                          <span className="text-muted-foreground">
                            / 5.0
                          </span>
                        </div>

                        <span className="text-muted-foreground text-[11px]">
                          {t('reviewCountLabel').replace('{count}', String(dept.totalRated))}
                        </span>
                      </div>

                      {/* Mini Sentiment Bar for Department */}
                      {dept.totalRated > 0 && (
                        <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${dept.positiveRatio}%` }}
                          />
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${dept.neutralRatio}%` }}
                          />
                          <div
                            className="h-full bg-rose-500"
                            style={{ width: `${dept.negativeRatio}%` }}
                          />
                        </div>
                      )}

                      {onSelectDepartment && (
                        <div className="mt-3 pt-2 border-t border-border/50 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                            onClick={() => onSelectDepartment(dept.department)}
                            aria-label={`Filter reports by ${deptName}`}
                          >
                            <Filter className="mr-1 h-3 w-3" />
                            {t('filterByDepartment')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recent Citizen Feedback Comments Toggle */}
            {commentsList.length > 0 && (
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-foreground">
                      {t('recentCitizenFeedback')}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {commentsList.length}
                    </Badge>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setShowComments((prev) => !prev)}
                    aria-expanded={showComments}
                  >
                    <span>{showComments ? t('hideComments') : t('viewComments')}</span>
                    {showComments ? (
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </Button>
                </div>

                {showComments && (
                  <div className="space-y-2.5 pt-2 border-t border-border/60">
                    {commentsList.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg bg-gray-50/70 p-3 text-xs dark:bg-gray-900/40 border border-border/40 space-y-1.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {item.title || item.complaintId}
                            </span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                              {item.department}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2">
                            <StarRatingDisplay rating={item.rating} />
                            {item.submittedAt && (
                              <span className="text-[11px] text-muted-foreground">
                                {formatDate(item.submittedAt, language)}
                              </span>
                            )}
                          </div>
                        </div>

                        {item.comment && (
                          <p className="italic text-gray-700 dark:text-gray-300">
                            &ldquo;{item.comment}&rdquo;
                          </p>
                        )}

                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center rounded-sm bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-950/60 dark:text-primary-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
