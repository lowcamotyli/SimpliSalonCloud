'use client'

import type { ReactElement } from 'react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  const title = mode === 'rules' ? 'Zarządzaj zasadami' : 'Zarządzaj szablonami'

  return (
    <div
      className={cn(
        'flex flex-col border rounded-lg bg-background transition-all duration-300 overflow-hidden',
        open ? 'w-96 opacity-100' : 'w-0 opacity-0 border-0'
      )}
    >
      <div className='flex shrink-0 items-center justify-between border-b px-4 py-3'>
        <h2 className='text-base font-semibold'>{title}</h2>
        <Button variant='ghost' size='icon' className='h-7 w-7' onClick={onClose}>
          <X className='h-4 w-4' />
        </Button>
      </div>
      <div className='flex-1 overflow-y-auto p-4'>
        {mode === 'rules' ? (
          <ShiftRulesManager employeeId={employeeId} />
        ) : (
          <ShiftTemplatesManager />
        )}
      </div>
    </div>
  )
}
