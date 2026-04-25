import { Skeleton } from '@/components/ui/skeleton'
import type { SkeletonProps } from '@/lib/themes/types'

export default function DefaultSkeleton({ className, ...props }: SkeletonProps) {
  return <Skeleton className={className} {...props} />
}
