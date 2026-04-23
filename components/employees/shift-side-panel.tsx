'use client'

import type { ReactElement } from 'react'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import { ShiftRulesManager } from './shift-rules-manager'
import { ShiftTemplatesManager } from './shift-templates-manager'

type ShiftSidePanelProps = {
  open: boolean
  onClose: () => void
  mode: 'rules' | 'templates'
  employeeId: string
}

export function ShiftSidePanel({
  open,
  onClose,
  mode,
  employeeId,
}: ShiftSidePanelProps): ReactElement {
  const title = mode === 'rules' ? 'Zarzadzaj zasadami' : 'Zarzadzaj szablonami'

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {mode === 'rules' ? (
            <ShiftRulesManager employeeId={employeeId} />
          ) : (
            <ShiftTemplatesManager />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
