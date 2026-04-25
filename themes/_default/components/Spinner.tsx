import { Loader2 } from 'lucide-react'
import type { SpinnerProps } from '@/lib/themes/types'
import { cn } from '@/lib/utils/cn'

const SPINNER_SIZE_CLASS: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

export default function DefaultSpinner({ size = 'md', className, ...props }: SpinnerProps): JSX.Element {
  return (
    <div className={cn('inline-flex items-center justify-center', className)} {...props}>
      <Loader2 className={cn('animate-spin', SPINNER_SIZE_CLASS[size])} />
    </div>
  )
}
