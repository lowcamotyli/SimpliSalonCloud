import { TabsTrigger } from '@/components/ui/tabs'
import type { TabsTriggerProps } from '@/lib/themes/types'

export default function DefaultTabsTrigger({ value, children, disabled, className }: TabsTriggerProps) {
  return (
    <TabsTrigger value={value} disabled={disabled} className={className}>
      {children}
    </TabsTrigger>
  )
}
