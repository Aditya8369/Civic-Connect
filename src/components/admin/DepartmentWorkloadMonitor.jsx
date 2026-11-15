
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DEPARTMENT_WORKLOAD_THRESHOLD, getDepartmentWorkload } from '@/utils/departmentWorkload'
import { useLanguage } from '@/contexts/LanguageContext'

const departmentTranslationKeys = {
  Roads: 'departmentRoads',
  Sanitation: 'departmentSanitation',
  Electricity: 'departmentElectricity',
  Water: 'departmentWater',
  'Public Safety': 'departmentPublicSafety',
}

export function DepartmentWorkloadMonitor({
  complaints = [],
  workload: providedWorkload,
  loading = false,
}) {
  const { t } = useLanguage()

  const workload = providedWorkload ?? getDepartmentWorkload(complaints)
  const maxCount = Math.max(...workload.map(({ count }) => count), 1)

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{t('departmentWorkloadDistribution')}</CardTitle>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {t('loadingDepartmentWorkload')}
          </div>
        ) : workload.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {t('noAssignedOpenTickets')}
          </div>
        ) : (
          <div className="space-y-5">
            {workload.map(({ department, count, isOverCapacity }) => (
              <div key={department}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {t(departmentTranslationKeys[department] || department)}
                  </span>

                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className={
                        isOverCapacity
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }
                    >
                      {t('openTicketsCount').replace('{count}', String(count))}
                    </span>

                    {isOverCapacity && (
                      <Badge variant="destructive">
                        {t('overWorkloadThreshold').replace(
                          '{count}',
                          String(DEPARTMENT_WORKLOAD_THRESHOLD)
                        )}
                      </Badge>
                    )}
                  </span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className={
                      isOverCapacity
                        ? 'h-full rounded-full bg-red-500'
                        : 'h-full rounded-full bg-primary-500'
                    }
                    style={{ width: (count / maxCount) * 100 + '%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
          {t('departmentWorkloadThresholdDescription').replace(
            '{count}',
            String(DEPARTMENT_WORKLOAD_THRESHOLD)
          )}
        </p>
      </CardContent>
    </Card>
  )
}
