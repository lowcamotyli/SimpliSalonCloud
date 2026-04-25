'use client'

import { Tabs } from '@/components/ui/tabs'
import type { TabsProps } from '@/lib/themes/types'

export default function DefaultTabs({
  value,
  onValueChange,
  defaultValue,
  children,
  className,
}: TabsProps) {
  return (
    <Tabs value={value} onValueChange={onValueChange} defaultValue={defaultValue} className={className}>
      {children}
    </Tabs>
  )
}
