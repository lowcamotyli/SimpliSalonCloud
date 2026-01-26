// components/settings/hours-editor.tsx
'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_LABELS: Record<string, string> = {
  monday: 'Poniedziałek',
  tuesday: 'Wtorek',
  wednesday: 'Środa',
  thursday: 'Czwartek',
  friday: 'Piątek',
  saturday: 'Sobota',
  sunday: 'Niedziela'
}

interface HoursEditorProps {
  hours: Record<string, { open: string | null; close: string | null; closed: boolean }>
  onChange: (hours: Record<string, any>) => void
}

export function HoursEditor({ hours, onChange }: HoursEditorProps) {
  const handleDayChange = (day: string, field: 'open' | 'close' | 'closed', value: any) => {
    onChange({
      ...hours,
      [day]: {
        ...hours[day],
        [field]: value
      }
    })
  }

  return (
    <div className="space-y-4">
      {DAYS.map(day => {
        const dayHours = hours[day] || { open: '09:00', close: '18:00', closed: false }
        
        return (
          <div key={day} className="flex items-center gap-4">
            <div className="w-32">
              <Label>{DAY_LABELS[day]}</Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                checked={dayHours.closed}
                onCheckedChange={(checked) => 
                  handleDayChange(day, 'closed', checked)
                }
              />
              <span className="text-sm text-muted-foreground">Zamknięte</span>
            </div>
            
            {!dayHours.closed && (
              <>
                <Input
                  type="time"
                  value={dayHours.open || '09:00'}
                  onChange={(e) => handleDayChange(day, 'open', e.target.value)}
                  className="w-32"
                />
                <span className="text-muted-foreground">-</span>
                <Input
                  type="time"
                  value={dayHours.close || '18:00'}
                  onChange={(e) => handleDayChange(day, 'close', e.target.value)}
                  className="w-32"
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}