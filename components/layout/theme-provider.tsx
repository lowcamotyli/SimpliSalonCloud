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
    root.setAttribute('data-theme-key', themeKey)

    // Helper to set HSL variable
    const setHslVar = (name: string, hex: string) => {
      root.style.setProperty(name, hexToHsl(hex))
    }

    setHslVar('--primary', theme.primary)
    setHslVar('--secondary', theme.secondary)
    setHslVar('--accent', theme.accent)
    setHslVar('--background', theme.background)
    setHslVar('--card', theme.card)

    // Set HEX variables for cases where HSL is not ideal
    root.style.setProperty('--primary-hex', theme.primary)
    root.style.setProperty('--background-hex', theme.background)
    root.style.setProperty('--text-hex', theme.text)

    // Set text/foreground
    setHslVar('--foreground', theme.text)
    setHslVar('--card-foreground', theme.text)
    setHslVar('--popover-foreground', theme.text)

    // Dynamic primary foreground for better contrast
    if (themeKey === 'auto_service' || themeKey === 'beauty_salon') {
      root.style.setProperty('--primary-foreground', '25 15% 15%') // Dark Brown/Black
    } else {
      root.style.setProperty('--primary-foreground', '0 0% 100%') // White
    }

    // Theme-specific border tuning
    root.style.setProperty('--border', themeKey === 'auto_service' ? '36 32% 83%' : '214.3 31.8% 91.4%')

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
