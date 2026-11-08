import { Skeleton } from '@/components/ui/skeleton'

export function PageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading page content"
      className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse"
    >
      {/* Top bar with branded loader */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-primary-600 animate-ping" />
            <Skeleton className="h-7 w-48 sm:w-64" />
          </div>
          <Skeleton className="h-4 w-32 sm:w-48" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <Skeleton className="h-9 w-24 rounded-lg hidden sm:block" />
        </div>
      </div>

      {/* Metric Cards Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Main Content Area Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-xs space-y-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <div className="pt-2 flex gap-3">
              <Skeleton className="h-9 w-32 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
            </div>
          </div>

          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-xs space-y-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/60 shadow-xs space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading page...</span>
    </div>
  )
}

