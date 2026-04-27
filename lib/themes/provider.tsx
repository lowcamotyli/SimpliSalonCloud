import * as React from 'react'

import { ComponentRegistryProvider } from './provider-client'
import type { ComponentRegistry, DesignTokens } from './types'

export { ComponentRegistryContext, useComponents } from './provider-client'

interface ThemeProviderProps {
  tokens: DesignTokens
  registry: ComponentRegistry
  children: React.ReactNode
}

export function generateCSSVariables(tokens: DesignTokens): string {
  const variables: string[] = []

  for (const [colorName, colorValue] of Object.entries(tokens.colors)) {
    if (typeof colorValue === 'string') {
      variables.push(`--color-${colorName}: ${colorValue};`)
      continue
    }

    for (const [shade, value] of Object.entries(colorValue)) {
      variables.push(`--color-${colorName}-${shade}: ${value};`)
    }
  }

  variables.push(`--font-family-sans: ${tokens.typography.fontFamily.sans};`)
  variables.push(`--font-family-mono: ${tokens.typography.fontFamily.mono};`)

  for (const [size, value] of Object.entries(tokens.typography.fontSize)) {
    variables.push(`--font-size-${size}: ${value};`)
  }

  for (const [radius, value] of Object.entries(tokens.borderRadius)) {
    variables.push(`--radius-${radius}: ${value};`)
  }

  for (const [shadow, value] of Object.entries(tokens.shadows)) {
    variables.push(`--shadow-${shadow}: ${value};`)
  }

  for (const [duration, value] of Object.entries(tokens.motion.duration)) {
    variables.push(`--motion-duration-${duration}: ${value};`)
  }

  return `:root { ${variables.join(' ')} }`
}

export function ThemeProvider({ tokens, registry, children }: ThemeProviderProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: generateCSSVariables(tokens) }} />
      <ComponentRegistryProvider registry={registry}>{children}</ComponentRegistryProvider>
    </>
  )
}
