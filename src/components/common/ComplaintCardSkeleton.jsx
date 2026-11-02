import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ComplaintCardSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </CardContent>
    </Card>
  )
}
