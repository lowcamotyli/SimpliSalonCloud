import { z } from 'zod'

export const createEmployeeSchema = z.object({
    firstName: z.string().min(2, 'Imię musi mieć minimum 2 znaki').max(50),
    lastName: z.string().max(50).optional().or(z.literal('')),
    email: z.string().email('Nieprawidłowy email'),
    phone: z.string().regex(/^\d{9,15}$/, 'Telefon musi mieć od 9 do 15 cyfr').optional().or(z.literal('')),
    baseThreshold: z.number().min(0).default(0),
    baseSalary: z.number().min(0).default(0),
    commissionRate: z.number().min(0).max(1).default(0),
    avatarUrl: z.string().url('Nieprawidłowy URL zdjęcia').optional().or(z.literal('')),
    active: z.boolean().default(true),
})

export const updateEmployeeSchema = createEmployeeSchema.partial()

export type CreateEmployeeDTO = z.infer<typeof createEmployeeSchema>
export type UpdateEmployeeDTO = z.infer<typeof updateEmployeeSchema>
