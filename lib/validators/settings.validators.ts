import { z } from 'zod'

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
    contact_phone: z.string().optional().or(z.literal('')),
    description: z.string().max(1000).optional(),
})

export type UpdateSettingsDTO = z.infer<typeof updateSettingsSchema>
