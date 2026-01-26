// lib/types/settings.ts
export const THEMES = {
  beauty_salon: {
    name: 'Beauty & Wellness',
    description: 'Elegancki design dla salonów urody',
    primary: '#FF69B4',
    secondary: '#FFB6C1',
    accent: '#FF1493',
    background: '#FFF5F7',
    text: '#2D1B2E',
    font: 'Playfair Display',
    borderRadius: 'lg',
    shadows: true,
  },
  auto_service: {
    name: 'Auto & Moto',
    description: 'Mocny design dla warsztatów',
    primary: '#1E40AF',
    secondary: '#94A3B8',
    accent: '#EF4444',
    background: '#0F172A',
    text: '#F1F5F9',
    font: 'Inter',
    borderRadius: 'sm',
    shadows: false,
  },
  ski_resort: {
    name: 'Outdoor & Sport',
    description: 'Sportowy design dla stoków',
    primary: '#06B6D4',
    secondary: '#64748B',
    accent: '#F59E0B',
    background: '#F8FAFC',
    text: '#0F172A',
    font: 'Roboto',
    borderRadius: 'md',
    shadows: true,
  },
} as const

export type ThemeKey = keyof typeof THEMES

export interface SalonSettings {
  id: string
  salon_id: string
  theme: ThemeKey
  custom_colors?: Record<string, string>
  logo_url?: string
  font_family: string
  business_type: string
  description?: string
  contact_phone?: string
  contact_email?: string
  website_url?: string
  address?: {
    street: string
    city: string
    postalCode: string
    country: string
  }
  operating_hours: Record<string, {
    open: string | null
    close: string | null
    closed: boolean
  }>
  closures: Array<{
    date: string
    reason: string
  }>
  booking_window_days: number
  min_notice_hours: number
  slot_duration_minutes: number
  allow_waitlist: boolean
  require_deposit: boolean
  deposit_amount?: number
  currency: string
  language: string
  timezone: string
  notification_settings: NotificationSettings
  // Booksy Integration
  booksy_enabled?: boolean
  booksy_gmail_email?: string
  booksy_gmail_tokens?: any
}

export interface NotificationSettings {
  clientReminders: {
    enabled: boolean
    timing: number[]
    channels: string[]
  }
  clientConfirmations: {
    enabled: boolean
    channels: string[]
  }
  newBooking: {
    enabled: boolean
    channels: string[]
  }
  cancellation: {
    enabled: boolean
    channels: string[]
  }
  dailySummary: {
    enabled: boolean
    time: string
    recipients: string[]
  }
}

export interface Integration {
  id: string
  name: string
  description: string
  icon: string
  type: string
  status: 'connected' | 'available'
  config?: string
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'booksy',
    name: 'Booksy',
    description: 'Sync appointments from Booksy',
    icon: '📅',
    type: 'booksy',
    status: 'available',
    config: '/settings/integrations/booksy'
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    description: 'Two-way sync with Google Calendar',
    icon: '📆',
    type: 'google_calendar',
    status: 'available'
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Accept online payments',
    icon: '💳',
    type: 'stripe',
    status: 'available'
  },
  {
    id: 'twilio',
    name: 'Twilio SMS',
    description: 'Send SMS reminders',
    icon: '💬',
    type: 'twilio',
    status: 'available'
  }
]