import type { AppConfig } from '@/lib/config/types'

import type { ComponentRegistry, DesignTokens } from './types'

interface ThemeModule {
  registry: ComponentRegistry
  tokens: DesignTokens
}

type ThemeLoadResult = Promise<ThemeModule>

const DEFAULT_THEME_ID: AppConfig['themeId'] = '_default'

function importTheme(themeId: AppConfig['themeId']): ThemeLoadResult {
  return import(`@/themes/${themeId}`) as ThemeLoadResult
}

export async function loadTheme(themeId: AppConfig['themeId']): Promise<{ registry: ComponentRegistry; tokens: DesignTokens }> {
  try {
    switch (themeId) {
      case 'simplisalon':
        return await importTheme('simplisalon')
      case '_default':
        return await importTheme(DEFAULT_THEME_ID)
      default:
        return await importTheme(DEFAULT_THEME_ID)
    }
  } catch {
    return importTheme(DEFAULT_THEME_ID)
  }
}
