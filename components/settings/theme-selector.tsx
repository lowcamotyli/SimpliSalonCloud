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
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(THEMES).map(([key, theme]) => {
        const isSelected = selected === key
        
        return (
          <Card
            key={key}
            className={cn(
              'group relative cursor-pointer overflow-hidden transition-all duration-300 hover:shadow-xl',
              isSelected ? 'ring-2 ring-primary ring-offset-2' : 'border-muted-foreground/20 hover:border-primary/40'
            )}
            onClick={() => onChange(key as ThemeKey)}
          >
            <div className="p-5">
              <div className="relative mb-5">
                <div
                  className={cn(
                    "h-32 w-full rounded-xl transition-transform duration-500 group-hover:scale-[1.02]",
                    key === 'auto_service' ? "border border-[#e6ddcf] shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]" : "border border-black/5"
                  )}
                  style={key === 'auto_service'
                    ? { background: 'linear-gradient(135deg, #fffdf9 0%, #f7efe4 62%, #d6b07a 100%)' }
                    : { background: theme.primary }}
                />
                
                {isSelected && (
                  <div className="absolute right-3 top-3 flex h-8 w-8 animate-in zoom-in items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md duration-200">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </div>
                )}
              </div>
              
              <div className="space-y-1.5 text-left">
                <h3 className="text-xl font-medium tracking-tight text-foreground">{theme.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{theme.description}</p>
              </div>
              
              <div className="mt-6 flex items-center gap-3">
                {[theme.primary, theme.secondary, theme.accent].map((color, i) => (
                  <div 
                    key={i}
                    className="h-8 w-8 rounded-full border border-black/10 shadow-sm transition-transform duration-200 hover:scale-110"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            {/* Subtle gradient overlay for unselected state */}
            {!isSelected && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            )}
            {/* Soft highlight for selected state */}
            {isSelected && (
              <div className="pointer-events-none absolute inset-0 rounded-xl bg-primary/[0.03]" />
            )}
          </Card>
        )
      })}
    </div>
  )
}
