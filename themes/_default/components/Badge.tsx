import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import type { BadgeProps } from '@/lib/themes/types'

export default function DefaultBadge(props: BadgeProps) {
  return <Badge {...(props as React.ComponentProps<typeof Badge>)} />
}
