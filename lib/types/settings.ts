// lib/types/settings.ts
import { Calendar, CalendarDays, Landmark, MessageSquare, type LucideIcon } from 'lucide-react'
export const THEMES = {
  beauty_salon: {
    name: 'Beauty & Wellness',
    description: 'Nowoczesna elegancja i naturalne tony',
    primary: '#D4A373',
    secondary: '#FAEDCD',
    accent: '#606C38',
    background: '#FEFAE0',
    card: '#FFFFFF',
    text: '#283618',
    font: 'Playfair Display',
    borderRadius: 'lg',
    shadows: true,
  },
  auto_service: {
    name: 'Testowy',
    description: 'Slot do testowania nowych wzorow UI',
    primary: '#CAA164',
    secondary: '#F3E7D5',
    accent: '#B48A52',
    background: '#FFFDF9',
    card: '#FFF8F0',
    text: '#2D241C',
    font: 'Cormorant Garamond',
    borderRadius: 'lg',
    shadows: true,
  },
  ski_resort: {
    name: 'Outdoor & Sport',
    description: 'Dynamiczny design i swiezosc',
    primary: '#2563EB',
    secondary: '#DBEAFE',
    accent: '#F97316',
    background: '#F8FAFC',
    card: '#FFFFFF',
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
  accounting_email?: string
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
  p24_merchant_id?: string
  p24_pos_id?: string
  p24_crc?: string
  p24_api_key?: string
  p24_api_url?: string
  p24_sandbox_mode?: boolean
  has_p24_crc?: boolean
  has_p24_api_key?: boolean
  booksy_enabled?: boolean
  booksy_gmail_email?: string
  booksy_gmail_tokens?: any
  booksy_sync_interval_minutes?: number
  booksy_sender_filter?: string
  booksy_auto_create_clients?: boolean
  booksy_auto_create_services?: boolean
  booksy_notify_on_new?: boolean
  booksy_notify_on_cancel?: boolean
  booksy_notify_email?: string
  booksy_last_sync_at?: string
  booksy_sync_stats?: {
    total: number
    success: number
    errors: number
  }
  resend_api_key?: string
  resend_from_email?: string
  resend_from_name?: string
  smsapi_token?: string
  smsapi_sender_name?: string
  has_resend_api_key?: boolean
  has_smsapi_token?: boolean
}

export interface SmsSettings {
  salon_id: string
  sms_provider?: 'smsapi' | 'bulkgate'
  smsapi_token?: string
  smsapi_sender_name?: string
  bulkgate_app_id?: string
  bulkgate_app_token?: string
  has_smsapi_token?: boolean
  has_bulkgate_app_token?: boolean
  reminder_rules?: Array<{
    id?: string
    hours_before: number
    message_template: string
    require_confirmation: boolean
    target_blacklisted_only: boolean
    is_active: boolean
  }>
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
  surveys: {
    enabled: boolean
    channel?: 'sms' | 'email' | 'both'
  }
  crmAutomations: {
    enabled: boolean
  }
  preAppointmentForms: {
    enabled: boolean
    channel?: 'sms' | 'email' | 'both'
  }
  campaigns: {
    enabled: boolean
  }
}

export interface Integration {
  id: string
  name: string
  description: string
  icon: LucideIcon
  type: string
  status: 'connected' | 'available'
  config?: string
}

export const INTEGRATIONS: Integration[] = [
  {
    id: 'booksy',
    name: 'Booksy',
    description: 'Synchronizacja rezerwacji z Booksy',
    icon: Calendar,
    type: 'booksy',
    status: 'available',
    config: '/settings/integrations/booksy'
  },
  {
    id: 'google_calendar',
    name: 'Kalendarz Google',
    description: 'Dwukierunkowa synchronizacja z Kalendarzem Google',
    icon: CalendarDays,
    type: 'google_calendar',
    status: 'available'
  },
  {
    id: 'przelewy24',
    name: 'Przelewy24',
    description: 'Bramka platnosci online - karty, BLIK, przelew',
    icon: Landmark,
    type: 'przelewy24',
    status: 'available',
    config: '/settings/integrations/przelewy24'
  },
  {
    id: 'twilio',
    name: 'SMS Twilio',
    description: 'Wysylaj przypomnienia SMS',
    icon: MessageSquare,
    type: 'twilio',
    status: 'available'
  }
]
