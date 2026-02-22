import { Database } from './supabase'

// Helper do wyciągania typów z database.ts
type Tables = Database['public']['Tables']

// Typy dla każdej tabeli
export type Booking = Tables['bookings']['Row']
export type BookingInsert = Tables['bookings']['Insert']
export type BookingUpdate = Tables['bookings']['Update']

export type Client = Tables['clients']['Row']
export type ClientInsert = Tables['clients']['Insert']
export type ClientUpdate = Tables['clients']['Update']

export type Service = Tables['services']['Row']
export type ServiceInsert = Tables['services']['Insert']
export type ServiceUpdate = Tables['services']['Update']

export type Employee = Tables['employees']['Row']
export type EmployeeInsert = Tables['employees']['Insert']
export type EmployeeUpdate = Tables['employees']['Update']

// Typ dla API response
export type ApiResponse<T> = {
    data?: T
    error?: {
        message: string
        code?: string
        details?: unknown
    }
}

// Typ dla paginacji
export type PaginatedResponse<T> = {
    data: T[]
    pagination: {
        page: number
        pageSize: number
        total: number
        hasMore: boolean
    }
}

// Typ dla booking z relacjami (JOIN)
export type BookingWithRelations = Booking & {
    client: Pick<Client, 'id' | 'full_name' | 'phone'>
    service: Pick<Service, 'id' | 'name' | 'duration' | 'price'>
    employee: Pick<Employee, 'id' | 'first_name' | 'last_name'>
}
