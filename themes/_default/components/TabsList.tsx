import type * as React from 'react'

import { TabsList } from '@/components/ui/tabs'

export default function DefaultTabsList({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <TabsList className={className}>{children}</TabsList>
}
