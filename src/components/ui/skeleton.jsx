import { cn } from '@/utils/cn'

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md bg-gray-200 dark:bg-gray-800',
        'before:absolute before:inset-0 before:animate-shimmer before:bg-linear-to-r before:from-transparent before:via-white/60 before:to-transparent dark:before:via-white/5 motion-reduce:before:hidden',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
