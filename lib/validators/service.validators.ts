import { z } from 'zod'

export const createServiceSchema = z.object({
    salon_id: z.string().uuid(),
    name: z.string().min(1, 'Nazwa usługi jest wymagana').max(100),
    category: z.string().min(1, 'Kategoria jest wymagana'),
    subcategory: z.string().min(1, 'Podkategoria jest wymagana'),
    description: z.string().max(500).optional(),
    duration: z.number().int().positive('Czas trwania musi być dodatni'),
    price: z.number().nonnegative('Cena nie może być ujemna'),
    active: z.boolean().default(true),
    surcharge_allowed: z.boolean().default(true),
})

export const updateServiceSchema = createServiceSchema.partial()

export type CreateServiceDTO = z.infer<typeof createServiceSchema>
export type UpdateServiceDTO = z.infer<typeof updateServiceSchema>
