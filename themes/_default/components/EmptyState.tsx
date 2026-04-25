import type * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import type { EmptyStateProps } from '@/lib/themes/types'
import { cn } from '@/lib/utils/cn'

type EmptyStateWithIcon = EmptyStateProps & {
  icon?: LucideIcon
}

export default function DefaultEmptyState({ title, description, action, className, ...rest }: EmptyStateProps): JSX.Element {
  const { icon } = rest as EmptyStateWithIcon

  if (icon && typeof title === 'string' && typeof description === 'string') {
    return <EmptyState icon={icon} title={title} description={description} className={className} />
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 p-6 text-center', className)}>
      {title ? <h3 className="text-lg font-semibold">{title}</h3> : null}
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
