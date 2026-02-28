import { SupabaseClient } from '@supabase/supabase-js'

interface ParsedBooking {
  type: 'new' | 'reschedule' | 'cancel'
  clientName: string
  clientPhone?: string
  clientEmail?: string
  serviceName?: string
  price?: number
  bookingDate: string // YYYY-MM-DD
  bookingTime: string // HH:mm
  employeeName?: string
  duration?: number
  // For rescheduling
  oldDate?: string
  oldTime?: string
}

export class BooksyProcessor {
  constructor(
    private supabase: SupabaseClient,
    private salonId: string
  ) { }

  /**
   * Parse Booksy email and create/update/cancel booking
   */
  // In order to properly test idempotency, the method must accept the event ID
  async processEmail(subject: string, body: string, options?: { eventId?: string }): Promise<any> {
    try {
      // 1. Check idempotency if eventId is provided
      if (options?.eventId) {
        const { data: existingBooking } = await this.supabase
          .from('bookings')
          .select('*')
          .eq('salon_id', this.salonId)
          .eq('source', 'booksy')
          .like('notes', `%[booksy_event_id:${options.eventId}]%`)
          .maybeSingle()

        if (existingBooking) {
          console.log(`[Booksy] Event ${options.eventId} already processed, skipping`)
          return { success: true, deduplicated: true, booking: existingBooking }
        }
      }

      // 1. Parse email
      const parsed = this.parseEmail(subject, body)
      if (!parsed) {
        throw new Error('Could not parse email format')
      }

      if (parsed.type === 'cancel') {
        return await this.handleCancellation(parsed)
      }

      if (parsed.type === 'reschedule') {
        return await this.handleReschedule(parsed)
      }

      // Handle 'new' booking
      // 2. Find or create client
      const client = await this.findOrCreateClient(parsed)

      // 3. Find employee
      const employee = await this.findEmployeeByName(parsed.employeeName!)
      if (!employee) {
        throw new Error(`Employee not found: ${parsed.employeeName}`)
      }

      // 4. Find service
      const service = await this.findServiceByName(parsed.serviceName!)
      if (!service) {
        throw new Error(`Service not found: ${parsed.serviceName}`)
      }

      // 5. Create booking
      const booking = await this.createBooking({
        clientId: client.id,
        employeeId: employee.id,
        serviceId: service.id,
        bookingDate: parsed.bookingDate,
        bookingTime: parsed.bookingTime,
        duration: parsed.duration || service.duration,
        price: parsed.price || service.price,
        eventId: options?.eventId,
      })

      return {
        success: true,
        type: 'new',
        booking,
        parsed,
      }
    } catch (error: any) {
      console.error('BooksyProcessor error:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Handle booking cancellation
   */
  private async handleCancellation(parsed: ParsedBooking) {
    // Find existing booking
    // Note: Since we don't have many identifiers, we match by client name (approx) + date + time
    const { data: bookings, error: findError } = await this.supabase
      .from('bookings')
      .select('*, clients!inner(full_name)')
      .eq('salon_id', this.salonId)
      .eq('booking_date', parsed.bookingDate)
      .eq('booking_time', parsed.bookingTime)
      .eq('status', 'scheduled')

    if (findError) throw findError

    // Filter by client name match
    const booking = bookings?.find(b =>
      b.clients.full_name.toLowerCase().includes(parsed.clientName.toLowerCase())
    )

    if (!booking) {
      throw new Error(`Original booking not found to cancel: ${parsed.clientName} at ${parsed.bookingDate} ${parsed.bookingTime}`)
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', booking.id)
      .select()
      .single()

    if (updateError) throw updateError

    return { success: true, type: 'cancel', booking: updated }
  }

  /**
   * Handle booking reschedule
   */
  private async handleReschedule(parsed: ParsedBooking) {
    if (!parsed.oldDate || !parsed.oldTime) {
      throw new Error('Missing old date/time for rescheduling')
    }

    // Find existing booking at OLD date/time
    const { data: bookings, error: findError } = await this.supabase
      .from('bookings')
      .select('*, clients!inner(full_name)')
      .eq('salon_id', this.salonId)
      .eq('booking_date', parsed.oldDate)
      .eq('booking_time', parsed.oldTime)
      .eq('status', 'scheduled')

    if (findError) throw findError

    const booking = bookings?.find(b =>
      b.clients.full_name.toLowerCase().includes(parsed.clientName.toLowerCase())
    )

    if (!booking) {
      throw new Error(`Original booking not found to reschedule: ${parsed.clientName} at ${parsed.oldDate} ${parsed.oldTime}`)
    }

    // Update to NEW date/time
    const { data: updated, error: updateError } = await this.supabase
      .from('bookings')
      .update({
        booking_date: parsed.bookingDate,
        booking_time: parsed.bookingTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', booking.id)
      .select()
      .single()

    if (updateError) throw updateError

    return { success: true, type: 'reschedule', booking: updated }
  }

  /**
   * Parse Booksy email format
   */
  private parseEmail(subject: string, body: string): ParsedBooking | null {
    try {
      // Determine type from subject
      let type: 'new' | 'reschedule' | 'cancel' = 'new'
      let clientName = ''

      if (subject.match(/nowa rezerwacja/i)) {
        type = 'new'
        clientName = subject.match(/^(.+?):\s*nowa rezerwacja/i)?.[1].trim() || ''
      } else if (subject.match(/zmienił rezerwację/i)) {
        type = 'reschedule'
        clientName = subject.match(/^(.+?):\s*zmienił/i)?.[1].trim() || ''
      } else if (subject.match(/odwołała wizytę|odwołał wizytę/i)) {
        type = 'cancel'
        clientName = subject.match(/^(.+?):\s*odwołał/i)?.[1].trim() || ''
      }

      if (!clientName) {
        // Try fallback parsing from body if subject failed
        const nameInBody = body.match(/^(.+?)\n/m)
        clientName = nameInBody ? nameInBody[1].trim() : ''
      }

      if (!clientName) return null

      // Clean body text (remove special characters)
      const cleanBody = body
        .replace(/â€"/g, '-')
        .replace(/Å‚/g, 'ł')
        .replace(/Å›/g, 'ś')
        .replace(/Ä…/g, 'ą')
        .replace(/Ä‡/g, 'ć')
        .replace(/Ä™/g, 'ę')
        .replace(/Å„/g, 'ń')
        .replace(/Ã³/g, 'ó')
        .replace(/Åº/g, 'ź')
        .replace(/Å¼/g, 'ż')

      if (type === 'cancel') {
        const dateMatch = this.extractDateAndTime(cleanBody)
        if (!dateMatch) return null
        return {
          type: 'cancel',
          clientName,
          bookingDate: dateMatch.date,
          bookingTime: dateMatch.time,
        }
      }

      if (type === 'reschedule') {
        // Reschedule format:
        // z dnia 27 października 2024 10:00
        // na 28 października 2024, 14:00 — 15:00
        const oldMatch = cleanBody.match(/z dnia (\d{1,2})\s+([^\s]+)\s+(\d{4})\s+(\d{2}):(\d{2})/i)
        const newMatch = cleanBody.match(/na (\d{1,2})\s+([^\s]+)\s+(\d{4}),\s+(\d{2}):(\d{2})/i)

        if (!oldMatch || !newMatch) return null

        const oldDate = this.formatDate(oldMatch[1], oldMatch[2], oldMatch[3])
        const oldTime = `${oldMatch[4]}:${oldMatch[5]}`

        const newDate = this.formatDate(newMatch[1], newMatch[2], newMatch[3])
        const newTime = `${newMatch[4]}:${newMatch[5]}`

        return {
          type: 'reschedule',
          clientName,
          bookingDate: newDate,
          bookingTime: newTime,
          oldDate,
          oldTime,
        }
      }

      // Handle 'new'
      // Extract phone
      const phoneMatch = cleanBody.match(/(?:\+?48\s?)?(\d{3}\s?\d{3}\s?\d{3})/m)
      const clientPhone = phoneMatch ? phoneMatch[0].replace(/[\s\+]/g, '') : ''

      // Extract email
      const emailMatch = cleanBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/m)
      const clientEmail = emailMatch ? emailMatch[1] : undefined

      // Extract service name and price
      const serviceMatch = cleanBody.match(/\n\n([\s\S]+?)\n([\d,]+)\s*zł/i)
      const serviceName = serviceMatch ? serviceMatch[1].trim() : ''
      const priceStr = serviceMatch ? serviceMatch[2].replace(',', '.') : '0'
      const price = parseFloat(priceStr)

      // Extract date and time
      const dateMatch = this.extractDateAndTime(cleanBody)
      if (!dateMatch) return null

      // Extract employee name
      const employeeMatch = cleanBody.match(/Pracownik:\s*\n\s*(.+?)(?:\n|$)/m)
      const employeeName = employeeMatch ? employeeMatch[1].trim() : ''

      if (!employeeName) return null

      const parsed = {
        type: 'new',
        clientName,
        clientPhone,
        clientEmail,
        serviceName,
        price,
        bookingDate: dateMatch.date,
        bookingTime: dateMatch.time,
        employeeName,
        duration: dateMatch.duration,
      } as const;
      return parsed;
    } catch (error) {
      return null
    }
  }

  private extractDateAndTime(body: string) {
    const dateMatch = body.match(/(\d{1,2})\s+([^\s]+)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*[-–—]\s*(\d{2}):(\d{2})/m)
    if (!dateMatch) return null

    const date = this.formatDate(dateMatch[1], dateMatch[2], dateMatch[3])
    const time = `${dateMatch[4]}:${dateMatch[5]}`

    const startMins = parseInt(dateMatch[4]) * 60 + parseInt(dateMatch[5])
    const endMins = parseInt(dateMatch[6]) * 60 + parseInt(dateMatch[7])
    const duration = endMins - startMins

    return { date, time, duration }
  }

  private formatDate(day: string, monthName: string, year: string) {
    const monthMap: Record<string, string> = {
      'stycznia': '01', 'lutego': '02', 'marca': '03', 'kwietnia': '04',
      'maja': '05', 'czerwca': '06', 'lipca': '07', 'sierpnia': '08',
      'września': '09', 'października': '10', 'listopada': '11', 'grudnia': '12'
    }
    const month = monthMap[monthName.toLowerCase()] || '01'
    return `${year}-${month}-${day.padStart(2, '0')}`
  }

  /**
   * Find or create client by phone
   */
  private async findOrCreateClient(parsed: ParsedBooking) {
    if (!parsed.clientPhone) throw new Error('Client phone is required for new bookings')

    // Try to find existing client by phone
    const { data: existingClient } = await this.supabase
      .from('clients')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('phone', parsed.clientPhone)
      .maybeSingle()

    if (existingClient) {
      return existingClient
    }

    // Generate client code
    const { data: codeData } = await this.supabase.rpc('generate_client_code', {
      salon_uuid: this.salonId,
    })

    // Create new client
    const { data: newClient, error } = await this.supabase
      .from('clients')
      .insert({
        salon_id: this.salonId,
        client_code: codeData,
        full_name: parsed.clientName,
        phone: parsed.clientPhone,
        email: parsed.clientEmail || null,
      })
      .select()
      .single()

    if (error) throw error
    return newClient
  }

  /**
   * Find employee by name (first_name or last_name)
   */
  private async findEmployeeByName(name: string) {
    const { data: employees } = await this.supabase
      .from('employees')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (!employees || employees.length === 0) {
      return null
    }

    // Try to match by first name or last name
    const nameLower = name.toLowerCase().trim()
    const match = employees.find((emp) => {
      const firstNameMatch = emp.first_name?.toLowerCase() === nameLower
      const lastNameMatch = emp.last_name?.toLowerCase() === nameLower
      const fullNameMatch =
        `${emp.first_name} ${emp.last_name}`.toLowerCase().trim() === nameLower
      return firstNameMatch || lastNameMatch || fullNameMatch
    })

    return match || null
  }

  /**
   * Normalize Polish diacritics to ASCII for fuzzy matching
   */
  private normalizeName(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
      .replace(/\s+/g, ' ')
  }

  /**
   * Find service by name
   */
  private async findServiceByName(name: string) {
    const { data: services } = await this.supabase
      .from('services')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (!services || services.length === 0) {
      return null
    }

    const nameLower = name.toLowerCase().trim()
    const nameNorm = this.normalizeName(name)

    // 1. Exact match
    let match = services.find((svc) => svc.name.toLowerCase() === nameLower)

    // 2. Partial match
    if (!match) {
      match = services.find((svc) => svc.name.toLowerCase().includes(nameLower))
    }

    // 3. Diacritic-normalized match (handles encoding differences)
    if (!match) {
      match = services.find((svc) => this.normalizeName(svc.name) === nameNorm)
    }

    // 4. Normalized partial match
    if (!match) {
      match = services.find((svc) => this.normalizeName(svc.name).includes(nameNorm))
    }

    if (!match) {
      console.error(
        `[Booksy] Service not found: "${name}". Available services:`,
        services.map((s) => `"${s.name}"`).join(', ')
      )
    }

    return match || null
  }

  /**
   * Create booking
   */
  private async createBooking(data: {
    clientId: string
    employeeId: string
    serviceId: string
    bookingDate: string
    bookingTime: string
    duration: number
    price: number
    eventId?: string
  }) {
    const notes = data.eventId ? `[booksy_event_id:${data.eventId}]` : null;

    const { data: booking, error } = await this.supabase
      .from('bookings')
      .insert({
        salon_id: this.salonId,
        client_id: data.clientId,
        employee_id: data.employeeId,
        service_id: data.serviceId,
        booking_date: data.bookingDate,
        booking_time: data.bookingTime,
        duration: data.duration,
        base_price: data.price,
        status: 'scheduled',
        source: 'booksy',
        notes: notes
      })
      .select()
      .single()

    if (error) throw error
    return booking
  }
}
