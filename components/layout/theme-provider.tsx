'use client'

import { useEffect } from 'react'
import { THEMES, type ThemeKey } from '@/lib/types/settings'
import { hexToHsl } from '@/lib/utils/color'

const REVAMP_V3 = {
  primary: '#32855F',
  secondary: '#276FB7',
  accent: '#0875E1',
  background: '#F3F5F7',
  card: '#FFFFFF',
  text: '#2C2C2C',
  border: '#E8EBED',
}

interface ThemeProviderProps {
  themeKey: ThemeKey
  children: React.ReactNode
}

export function ThemeProvider({ themeKey, children }: ThemeProviderProps) {
  useEffect(() => {
    if (!THEMES[themeKey]) return

    const root = document.documentElement
    root.setAttribute('data-theme-key', themeKey)

    // Helper to set HSL variable
    const setHslVar = (name: string, hex: string) => {
      root.style.setProperty(name, hexToHsl(hex))
    }

    setHslVar('--primary', REVAMP_V3.primary)
    setHslVar('--secondary', REVAMP_V3.secondary)
    setHslVar('--accent', REVAMP_V3.accent)
    setHslVar('--background', REVAMP_V3.background)
    setHslVar('--card', REVAMP_V3.card)

    // Set HEX variables for cases where HSL is not ideal
    root.style.setProperty('--primary-hex', REVAMP_V3.primary)
    root.style.setProperty('--background-hex', REVAMP_V3.background)
    root.style.setProperty('--text-hex', REVAMP_V3.text)

    // Set text/foreground
    setHslVar('--foreground', REVAMP_V3.text)
    setHslVar('--card-foreground', REVAMP_V3.text)
    setHslVar('--popover-foreground', REVAMP_V3.text)
    setHslVar('--border', REVAMP_V3.border)
    setHslVar('--input', REVAMP_V3.border)
    setHslVar('--ring', REVAMP_V3.secondary)

    root.style.setProperty('--primary-foreground', '0 0% 100%')
    root.style.setProperty('--secondary-foreground', '0 0% 100%')
    root.style.setProperty('--accent-foreground', '0 0% 100%')
    root.style.setProperty('--radius', 'var(--v3-r-md)')

  }, [themeKey])

  return <>{children}</>
}
