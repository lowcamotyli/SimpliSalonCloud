export type BusinessProfile = 'beauty_salon' | 'gym' | 'medical' | 'workshop' | 'agency' | 'custom'

export interface AppConfig {
  appId: string
  appName: string
  appUrl: string
  businessProfile: BusinessProfile
  enabledModules: string[]
  moduleConfigs: Record<string, unknown>
  themeId: string
  branding: { logoUrl: string; faviconUrl: string; primaryColor: string }
  locale: string
  timezone: string
  currency: string
}
