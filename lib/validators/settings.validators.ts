import { z } from 'zod'

export const MASKED_SECRET = '********'

const smsSenderNameSchema = z
    .string()
    .max(11)
    .regex(/^[a-zA-Z0-9]*$/)

export const updateSettingsSchema = z.object({
    theme: z.string().optional(),
    font_family: z.string().optional(),
    business_type: z.string().optional(),
    booking_window_days: z.number().int().positive().optional(),
    min_notice_hours: z.number().int().nonnegative().optional(),
    slot_duration_minutes: z.number().int().positive().optional(),
    allow_waitlist: z.boolean().optional(),
    require_deposit: z.boolean().optional(),
    currency: z.string().optional(),
    language: z.string().optional(),
    timezone: z.string().optional(),
    operating_hours: z.record(z.any()).optional(),
    notification_settings: z.record(z.any()).optional(),
    address: z.any().optional(),
    logo_url: z.string().url().optional().or(z.literal('')),
    website_url: z.string().url().optional().or(z.literal('')),
    contact_email: z.string().email().optional().or(z.literal('')),
    accounting_email: z.string().email().optional().or(z.literal('')),
    contact_phone: z.string().optional().or(z.literal('')),
    description: z.string().max(1000).optional(),
    resend_api_key: z.string().optional().or(z.literal('')),
    resend_from_email: z.string().email().optional().or(z.literal('')),
    resend_from_name: z.string().max(120).optional().or(z.literal('')),
    smsapi_token: z.string().optional().or(z.literal('')),
    smsapi_sender_name: smsSenderNameSchema.optional().or(z.literal('')),
    // Przelewy24 per-salon
    p24_merchant_id: z.string().max(20).optional().or(z.literal('')),
    p24_pos_id: z.string().max(20).optional().or(z.literal('')),
    p24_crc: z.string().optional().or(z.literal('')),
    p24_api_key: z.string().optional().or(z.literal('')),
    p24_api_url: z.string().url().optional().or(z.literal('')),
    p24_sandbox_mode: z.boolean().optional(),
})

export const updateSmsSettingsSchema = z.object({
    smsapi_token: z.string().optional().or(z.literal('')),
    smsapi_sender_name: smsSenderNameSchema.optional().or(z.literal('')),
})

export const testSmsSettingsSchema = z.object({
    salonId: z.string().uuid(),
    to: z.string().regex(/^\+?[1-9]\d{5,14}$/),
})

export type UpdateSettingsDTO = z.infer<typeof updateSettingsSchema>
export type UpdateSmsSettingsDTO = z.infer<typeof updateSmsSettingsSchema>
