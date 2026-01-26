import { z } from 'zod'

export const createClientSchema = z.object({
    salon_id: z.string().uuid(),
    first_name: z.string().min(1, 'Imię jest wymagane').max(50),
    last_name: z.string().min(1, 'Nazwisko jest wymagane').max(50),
    phone: z.string().regex(
        /^\+?[0-9]{9,15}$/,
        'Numer telefonu musi mieć 9-15 cyfr'
    ),
    email: z.string().email('Nieprawidłowy adres email').optional().or(z.literal('')),
    notes: z.string().max(1000).optional(),
})

export const updateClientSchema = createClientSchema.partial()

export type CreateClientDTO = z.infer<typeof createClientSchema>
export type UpdateClientDTO = z.infer<typeof updateClientSchema>
