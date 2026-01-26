'use client'

import { useEffect } from 'react'
import { THEMES, type ThemeKey } from '@/lib/types/settings'
import { hexToHsl } from '@/lib/utils/color'

interface ThemeProviderProps {
  themeKey: ThemeKey
  children: React.ReactNode
}

export function ThemeProvider({ themeKey, children }: ThemeProviderProps) {
  useEffect(() => {
    const theme = THEMES[themeKey]
    if (!theme) return

    const root = document.documentElement
    
    // Helper to set HSL variable
    const setHslVar = (name: string, hex: string) => {
      root.style.setProperty(name, hexToHsl(hex))
    }

    setHslVar('--primary', theme.primary)
    setHslVar('--secondary', theme.secondary)
    setHslVar('--accent', theme.accent)
    setHslVar('--background', theme.background)
    
    // Set text/foreground
    setHslVar('--foreground', theme.text)
    setHslVar('--card-foreground', theme.text)
    setHslVar('--popover-foreground', theme.text)
    
    // Set border based on background brightness (simplified)
    root.style.setProperty('--border', '214.3 31.8% 91.4%') // Default border
    
    // Set radius
    const radiusMap = {
      sm: '0.3rem',
      md: '0.5rem',
      lg: '0.75rem'
    }
    root.style.setProperty('--radius', radiusMap[theme.borderRadius])

  }, [themeKey])

  return <>{children}</>
}
