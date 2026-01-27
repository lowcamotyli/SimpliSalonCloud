import { z } from 'zod'

// Base schema for reuse
const baseBookingSchema = z.object({
    salon_id: z.string().uuid('ID salonu musi być UUID').optional(),
    client_id: z.string().uuid('ID klienta musi być UUID').optional().nullable(),
    clientName: z.string().optional().or(z.literal('')),
    clientPhone: z.string().optional().or(z.literal('')),
    service_id: z.string().uuid('ID usługi musi być UUID'),
    employee_id: z.string().uuid('ID pracownika musi być UUID'),

    date: z.string().regex(
        /^\d{4}-\d{2}-\d{2}$/,
        'Data musi być w formacie YYYY-MM-DD'
    ),

    start_time: z.string().regex(
        /^\d{2}:\d{2}$/,
        'Godzina musi być w formacie HH:MM'
    ),

    end_time: z.string().regex(
        /^\d{2}:\d{2}$/,
        'Godzina musi być w formacie HH:MM'
    ).optional().or(z.literal('')),

    duration: z.number().int().positive().optional(),

    status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'scheduled']).optional(),

    notes: z.string().max(500, 'Notatka może mieć max 500 znaków').optional().or(z.literal('')),
    paymentMethod: z.string().optional().or(z.literal('')),
    surcharge: z.number().nonnegative().optional(),
})

// Schema dla tworzenia nowego bookingu
export const createBookingSchema = baseBookingSchema.refine(
    (data) => {
        // Skip validation if end_time is not provided or empty
        if (!data.start_time || !data.end_time || data.end_time === '') return true

        // Sprawdź czy end_time jest po start_time
        const start = new Date(`2000-01-01T${data.start_time}`)
        const end = new Date(`2000-01-01T${data.end_time}`)
        return end > start
    },
    {
        message: 'Godzina zakończenia musi być po godzinie rozpoczęcia',
        path: ['end_time']
    }
)

// Schema dla edycji (wszystkie pola opcjonalne)
export const updateBookingSchema = baseBookingSchema.partial()

// Schema dla ID w URL
export const bookingIdSchema = z.object({
    id: z.string().uuid('ID musi być UUID')
})

// Wyeksportuj typy
export type CreateBookingDTO = z.infer<typeof createBookingSchema>
export type UpdateBookingDTO = z.infer<typeof updateBookingSchema>
