/**
 * Booksy Email Processor
 * Main logic for processing Booksy emails
 */

import { parseBooksyEmail } from './email-parser'
import type { Database } from '@/types/database'

type Booking = Database['public']['Tables']['bookings']['Insert']
type Client = Database['public']['Tables']['clients']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Service = Database['public']['Tables']['services']['Row']

interface ProcessResult {
  success: boolean
  bookingId?: string
  action?: 'created' | 'updated' | 'cancelled'
  error?: string
}

export class BooksyProcessor {
  constructor(
    private supabase: any,
    private salonId: string
  ) {}

  /**
   * Process a single Booksy email
   */
  async processEmail(subject: string, body: string): Promise<ProcessResult> {
    try {
      // Parse email
      const parsed = parseBooksyEmail(subject, body)
      
      if (!parsed) {
        return { success: false, error: 'Failed to parse email' }
      }

      // Handle based on type
      switch (parsed.type) {
        case 'new':
          return await this.handleNewBooking(parsed)
        
        case 'change':
          return await this.handleChangeBooking(parsed)
        
        case 'cancel':
          return await this.handleCancelBooking(parsed)
        
        default:
          return { success: false, error: 'Unknown email type' }
      }
    } catch (error: any) {
      console.error('Error processing Booksy email:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Handle new booking
   */
  private async handleNewBooking(data: any): Promise<ProcessResult> {
    // 1. Get or create client
    const client = await this.getOrCreateClient(data.clientName, data.clientPhone)
    if (!client) {
      return { success: false, error: 'Failed to get/create client' }
    }

    // 2. Match employee by first name
    const employee = await this.matchEmployeeByName(data.employeeName)
    if (!employee) {
      return { success: false, error: `Employee not found: ${data.employeeName}` }
    }

    // 3. Match service by name
    const service = await this.matchServiceByName(data.serviceName)
    if (!service) {
      return { success: false, error: `Service not found: ${data.serviceName}` }
    }

    // 4. Check slot availability
    const isAvailable = await this.checkSlotAvailability(
      employee.id,
      data.date,
      data.time
    )

    if (!isAvailable) {
      return { 
        success: false, 
        error: `Slot already taken: ${data.date} ${data.time}` 
      }
    }

    // 5. Create booking
    const { data: booking, error } = await this.supabase
      .from('bookings')
      .insert({
        salon_id: this.salonId,
        employee_id: employee.id,
        client_id: client.id,
        service_id: service.id,
        booking_date: data.date,
        booking_time: data.time,
        duration: data.duration || service.duration,
        base_price: data.price || service.price,
        surcharge: 0,
        status: 'confirmed',
        source: 'booksy',
        notes: 'Źródło: Booksy',
      })
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    // 6. Increment client visit count
    await this.supabase.rpc('increment_client_visits', { 
      client_uuid: client.id 
    })

    return { 
      success: true, 
      bookingId: booking.id,
      action: 'created'
    }
  }

  /**
   * Handle booking change
   */
  private async handleChangeBooking(data: any): Promise<ProcessResult> {
    // 1. Find existing booking by old date/time
    const employee = await this.matchEmployeeByName(data.employeeName)
    if (!employee) {
      return { success: false, error: `Employee not found: ${data.employeeName}` }
    }

    const { data: existingBooking } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('employee_id', employee.id)
      .eq('booking_date', data.oldDate)
      .eq('booking_time', data.oldTime)
      .neq('status', 'cancelled')
      .single()

    if (!existingBooking) {
      return { success: false, error: 'Original booking not found' }
    }

    // 2. Check new slot availability
    const isAvailable = await this.checkSlotAvailability(
      employee.id,
      data.date,
      data.time
    )

    if (!isAvailable) {
      return { 
        success: false, 
        error: `New slot already taken: ${data.date} ${data.time}` 
      }
    }

    // 3. Update booking
    const { data: updatedBooking, error } = await this.supabase
      .from('bookings')
      .update({
        booking_date: data.date,
        booking_time: data.time,
        notes: (existingBooking.notes || '') + ' | Zmieniono przez Booksy',
      })
      .eq('id', existingBooking.id)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { 
      success: true, 
      bookingId: updatedBooking.id,
      action: 'updated'
    }
  }

  /**
   * Handle booking cancellation
   */
  private async handleCancelBooking(data: any): Promise<ProcessResult> {
    // 1. Find booking
    const employee = await this.matchEmployeeByName(data.employeeName)
    if (!employee) {
      return { success: false, error: `Employee not found: ${data.employeeName}` }
    }

    const { data: existingBooking } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('employee_id', employee.id)
      .eq('booking_date', data.date)
      .eq('booking_time', data.time)
      .neq('status', 'cancelled')
      .single()

    if (!existingBooking) {
      return { success: false, error: 'Booking not found' }
    }

    // 2. Cancel booking
    const { data: cancelledBooking, error } = await this.supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        notes: (existingBooking.notes || '') + ' | Anulowano przez Booksy',
      })
      .eq('id', existingBooking.id)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { 
      success: true, 
      bookingId: cancelledBooking.id,
      action: 'cancelled'
    }
  }

  /**
   * Get or create client by phone
   */
  private async getOrCreateClient(name: string, phone: string): Promise<Client | null> {
    if (!phone) return null

    // Try to find existing
    const { data: existing } = await this.supabase
      .from('clients')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('phone', phone)
      .single()

    if (existing) return existing

    // Create new
    const { data: codeData } = await this.supabase
      .rpc('generate_client_code', { salon_uuid: this.salonId })

    const { data: newClient } = await this.supabase
      .from('clients')
      .insert({
        salon_id: this.salonId,
        client_code: codeData,
        full_name: name,
        phone,
      })
      .select()
      .single()

    return newClient
  }

  /**
   * Match employee by first name (case-insensitive)
   */
  private async matchEmployeeByName(firstName: string): Promise<Employee | null> {
    if (!firstName) return null

    const { data: employees } = await this.supabase
      .from('employees')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (!employees || employees.length === 0) return null

    // Find by first name (case-insensitive)
    const match = employees.find((emp: Employee) =>
      emp.first_name.toLowerCase() === firstName.toLowerCase()
    )

    return match || null
  }

  /**
   * Match service by name (fuzzy matching)
   */
  private async matchServiceByName(serviceName: string): Promise<Service | null> {
    if (!serviceName) return null

    const { data: services } = await this.supabase
      .from('services')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (!services || services.length === 0) return null

    // Exact match first
    let match = services.find((svc: Service) =>
      svc.name.toLowerCase() === serviceName.toLowerCase()
    )

    if (!match) {
      // Fuzzy match (contains)
      match = services.find((svc: Service) =>
        svc.name.toLowerCase().includes(serviceName.toLowerCase()) ||
        serviceName.toLowerCase().includes(svc.name.toLowerCase())
      )
    }

    return match || null
  }

  /**
   * Check if slot is available
   */
  private async checkSlotAvailability(
    employeeId: string,
    date: string,
    time: string
  ): Promise<boolean> {
    const { data: existing } = await this.supabase
      .from('bookings')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('booking_date', date)
      .eq('booking_time', time)
      .neq('status', 'cancelled')
      .single()

    return !existing
  }
}