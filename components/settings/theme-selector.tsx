// components/settings/theme-selector.tsx
'use client'

import { THEMES, type ThemeKey } from '@/lib/types/settings'
import { Card } from '@/components/ui/card'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeSelectorProps {
  selected: ThemeKey
  onChange: (theme: ThemeKey) => void
}

export function ThemeSelector({ selected, onChange }: ThemeSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Object.entries(THEMES).map(([key, theme]) => {
        const isSelected = selected === key
        
        return (
          <Card
            key={key}
            className={cn(
              'relative cursor-pointer transition-all hover:shadow-lg',
              isSelected && 'ring-2 ring-primary'
            )}
            onClick={() => onChange(key as ThemeKey)}
          >
            <div className="p-4">
              {isSelected && (
                <div className="absolute top-2 right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="h-4 w-4" />
                </div>
              )}
              
              <div className="mb-3 h-20 rounded-lg" style={{ background: theme.primary }} />
              
              <h3 className="font-semibold mb-1">{theme.name}</h3>
              <p className="text-sm text-muted-foreground">{theme.description}</p>
              
              <div className="flex gap-2 mt-3">
                {[theme.primary, theme.secondary, theme.accent].map((color, i) => (
                  <div 
                    key={i}
                    className="h-6 w-6 rounded-full border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}