import { z } from 'zod'

// Common validation schemas
export const phoneSchema = z
  .string()
  .regex(/^\d{9}$/, 'Numer telefonu musi mieć 9 cyfr')

export const emailSchema = z
  .string()
  .email('Nieprawidłowy adres email')
  .optional()
  .or(z.literal(''))

export const employeeCodeSchema = z
  .string()
  .regex(/^EMP\d{3}$/, 'Kod pracownika: EMP + 3 cyfry')

export const clientCodeSchema = z
  .string()
  .regex(/^CLI\d{4}$/, 'Kod klienta: CLI + 4 cyfry')

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data w formacie YYYY-MM-DD')

export const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Godzina w formacie HH:mm')

export const priceSchema = z
  .number()
  .min(0, 'Cena nie może być ujemna')
  .max(10000, 'Cena zbyt wysoka')

export const durationSchema = z
  .number()
  .int()
  .min(15, 'Minimalny czas: 15 minut')
  .max(480, 'Maksymalny czas: 8 godzin')