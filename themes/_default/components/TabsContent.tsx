import { TabsContent } from '@/components/ui/tabs'
import type { TabsContentProps } from '@/lib/themes/types'

export default function DefaultTabsContent({ value, children, className }: TabsContentProps) {
  return (
    <TabsContent value={value} className={className}>
      {children}
    </TabsContent>
  )
}
