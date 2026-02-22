import { z } from 'zod'

export const availabilityQuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: YYYY-MM-DD'),
    serviceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
})

export const publicBookingSchema = z.object({
    name: z.string().min(2).max(100),
    phone: z.string().regex(/^\+?[0-9]{9,15}$/),
    email: z.string().email().optional(),
    serviceId: z.string().uuid(),
    employeeId: z.string().uuid().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
})

export type PublicBookingInput = z.infer<typeof publicBookingSchema>
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>
