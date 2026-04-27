import type { AppConfig } from '@/lib/config/types'

const appConfig: AppConfig = {
  appId: 'simplisalon',
  appName: 'SimpliSalon Cloud',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.simplisalon.pl',
  businessProfile: 'beauty_salon',
  enabledModules: [
    'calendar',
    'employees',
    'absence',
    'crm',
    'notifications',
    'forms',
    'surveys',
    'billing',
    'integrations',
  ],
  moduleConfigs: {
    calendar: {
      bookingWindowDays: 60,
      cancellationWindowHours: 24,
      defaultDurationMinutes: 60,
      bufferMinutes: 0,
      equipmentEnabled: true,
      groupBookingEnabled: true,
      onlineBookingEnabled: true,
    },
    employees: {
      contractTypes: ['employment', 'b2b', 'civil_law'],
      documentCategories: ['id_card', 'cv', 'certificate', 'other'],
      departments: ['reception', 'stylist', 'nail_tech', 'management'],
    },
    absence: {
      types: [
        { code: 'annual_leave', name: 'Urlop wypoczynkowy', daysPerYear: 26 },
        { code: 'sick_leave', name: 'Zwolnienie lekarskie', daysPerYear: null },
      ],
      approvalRequired: true,
    },
    crm: {
      channels: ['sms', 'email'],
      automationsEnabled: true,
    },
  },
  themeId: 'simplisalon',
  branding: {
    logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico',
    primaryColor: '#f43f5e',
  },
  locale: 'pl',
  timezone: 'Europe/Warsaw',
  currency: 'PLN',
}

export default appConfig
