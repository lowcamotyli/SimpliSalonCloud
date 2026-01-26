'use client'

import { useEffect } from 'react'
import { THEMES, type ThemeKey } from '@/lib/types/settings'

interface ThemeStyleProps {
    themeKey: ThemeKey
}

export function ThemeStyle({ themeKey }: ThemeStyleProps) {
    useEffect(() => {
        const theme = THEMES[themeKey]
        if (!theme) return

        const root = document.documentElement

        // Set colors from theme
        root.style.setProperty('--primary', hexToHSL(theme.primary))
        root.style.setProperty('--primary-hex', theme.primary)
        root.style.setProperty('--background-hex', theme.background)
        root.style.setProperty('--text-hex', theme.text)

        // Derived colors logic would go here if needed

    }, [themeKey])

    return null
}

function hexToHSL(hex: string): string {
    // Simple conversion for tailwind HSL format: "H S% L%"
    // Simplified implementation for now
    let r = parseInt(hex.slice(1, 3), 16) / 255
    let g = parseInt(hex.slice(3, 5), 16) / 255
    let b = parseInt(hex.slice(5, 7), 16) / 255

    let max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
        let d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break
            case g: h = (b - r) / d + 2; break
            case b: h = (r - g) / d + 4; break
        }
        h /= 6
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}
