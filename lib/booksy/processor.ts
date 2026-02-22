import { SupabaseClient } from '@supabase/supabase-js'

interface ParsedBooking {
  clientName: string
  clientPhone: string
  clientEmail?: string
  serviceName: string
  price: number
  bookingDate: string // YYYY-MM-DD
  bookingTime: string // HH:mm
  employeeName: string
  duration?: number
}

interface ProcessEmailOptions {
  eventId?: string
}

export class BooksyProcessor {
  constructor(
    private supabase: SupabaseClient,
    private salonId: string
  ) {}

  /**
   * Parse Booksy email and create booking
   */
  async processEmail(subject: string, body: string, options?: ProcessEmailOptions): Promise<any> {
    try {
      console.log('=== PROCESS EMAIL START ===')

      const eventMarker = options?.eventId ? `[booksy_event_id:${options.eventId}]` : null

      if (eventMarker) {
        const existingByEvent = await this.findBookingByEventMarker(eventMarker)
        if (existingByEvent) {
          return {
            success: true,
            deduplicated: true,
            booking: existingByEvent,
          }
        }
      }
      
      // 1. Parse email
      const parsed = this.parseEmail(subject, body)
      if (!parsed) {
        throw new Error('Could not parse email format')
      }
      console.log('✅ Step 1: Email parsed successfully')

      // 2. Find or create client
      console.log('⏳ Step 2: Finding/creating client...')
      const client = await this.findOrCreateClient(parsed)
      console.log('✅ Step 2: Client found/created:', client.id, client.full_name)

      // 3. Find employee
      console.log('⏳ Step 3: Finding employee:', parsed.employeeName)
      const employee = await this.findEmployeeByName(parsed.employeeName)
      if (!employee) {
        throw new Error(`Employee not found: ${parsed.employeeName}`)
      }
      console.log('✅ Step 3: Employee found:', employee.id, employee.first_name, employee.last_name)

      // 4. Find service
      console.log('⏳ Step 4: Finding service:', parsed.serviceName)
      const service = await this.findServiceByName(parsed.serviceName)
      if (!service) {
        throw new Error(`Service not found: ${parsed.serviceName}`)
      }
      console.log('✅ Step 4: Service found:', service.id, service.name)

      // 5. Create booking
      console.log('⏳ Step 5: Creating booking...')
      const booking = await this.createBooking({
        clientId: client.id,
        employeeId: employee.id,
        serviceId: service.id,
        bookingDate: parsed.bookingDate,
        bookingTime: parsed.bookingTime,
        duration: parsed.duration || service.duration,
        price: parsed.price || service.price,
        notes: eventMarker,
      })
      console.log('✅ Step 5: Booking created:', booking.id)
      console.log('=== PROCESS EMAIL SUCCESS ===')

      return {
        success: true,
        booking,
        parsed,
      }
    } catch (error: any) {
      console.error('=== PROCESS EMAIL FAILED ===')
      console.error('BooksyProcessor error:', error)
      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Parse Booksy email format
   */
  private parseEmail(subject: string, body: string): ParsedBooking | null {
    try {
      // Extract client name from subject: "Anna Kowalska: nowa rezerwacja"
      const nameMatch = subject.match(/^(.+?):\s*nowa rezerwacja/i)
      const clientName = nameMatch ? nameMatch[1].trim() : ''

      if (!clientName) {
        console.error('Could not extract client name from subject')
        return null
      }

      // Clean body text (remove special characters and normalize)
      const cleanBody = body
        .replace(/â€"/g, '-')
        .replace(/—/g, '-')  // em-dash
        .replace(/–/g, '-')  // en-dash
        .replace(/Å‚/g, 'ł')
        .replace(/Å›/g, 'ś')
        .replace(/Ä…/g, 'ą')
        .replace(/Ä‡/g, 'ć')
        .replace(/Ä™/g, 'ę')
        .replace(/Å„/g, 'ń')
        .replace(/Ã³/g, 'ó')
        .replace(/Åº/g, 'ź')
        .replace(/Å¼/g, 'ż')
      
      console.log('=== PARSING EMAIL ===')
      console.log('Subject:', subject)
      console.log('Body (cleaned):', cleanBody)

      // Extract phone (9 digits, might have spaces)
      const phoneMatch = cleanBody.match(/(\d{3}\s?\d{3}\s?\d{3})/m)
      const clientPhone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : ''

      // Extract email (optional)
      const emailMatch = cleanBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/m)
      const clientEmail = emailMatch ? emailMatch[1] : undefined

      // Extract service name and price
      // Format: "Strzyżenie damskie wł. średnie\n250,00 zł"
      const serviceMatch = cleanBody.match(/\n\n(.+?)\n([\d,]+)\s*zł/ms)
      const serviceName = serviceMatch ? serviceMatch[1].trim() : ''
      const priceStr = serviceMatch ? serviceMatch[2].replace(',', '.') : '0'
      const price = parseFloat(priceStr)

      // Extract date and time
      // Format: "27 października 2024, 16:00 - 17:00" (after cleaning, it's a simple dash)
      // Use .+? instead of \w+ to match Polish characters (ą, ć, ę, ł, ń, ó, ś, ź, ż)
      const dateMatch = cleanBody.match(/(\d{1,2})\s+(.+?)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/m)

      console.log('Date regex match:', dateMatch)

      if (!dateMatch) {
        console.error('Could not extract date/time from body')
        console.error('Searching for pattern: DD MONTH YYYY, HH:MM - HH:MM')
        return null
      }

      const day = dateMatch[1].padStart(2, '0')
      const monthName = dateMatch[2]
      const year = dateMatch[3]
      const startHour = dateMatch[4]
      const startMinute = dateMatch[5]
      const endHour = dateMatch[6]
      const endMinute = dateMatch[7]

      // Convert Polish month name to number
      const monthMap: Record<string, string> = {
        'stycznia': '01',
        'lutego': '02',
        'marca': '03',
        'kwietnia': '04',
        'maja': '05',
        'czerwca': '06',
        'lipca': '07',
        'sierpnia': '08',
        'września': '09',
        'października': '10',
        'listopada': '11',
        'grudnia': '12',
      }
      const month = monthMap[monthName.toLowerCase()] || '01'

      const bookingDate = `${year}-${month}-${day}`
      const bookingTime = `${startHour}:${startMinute}`

      // Calculate duration in minutes
      const startMins = parseInt(startHour) * 60 + parseInt(startMinute)
      const endMins = parseInt(endHour) * 60 + parseInt(endMinute)
      const duration = endMins - startMins

      // Extract employee name
      // Format: "Pracownik:\nKasia"
      const employeeMatch = cleanBody.match(/Pracownik:\s*\n\s*(.+?)(?:\n|$)/m)
      const employeeName = employeeMatch ? employeeMatch[1].trim() : ''

      console.log('Employee name extracted:', employeeName)

      if (!employeeName) {
        console.error('Could not extract employee name')
        return null
      }

      const parsed = {
        clientName,
        clientPhone,
        clientEmail,
        serviceName,
        price,
        bookingDate,
        bookingTime,
        employeeName,
        duration,
      }

      console.log('=== PARSED DATA ===')
      console.log(JSON.stringify(parsed, null, 2))

      return parsed
    } catch (error) {
      console.error('Parse error:', error)
      return null
    }
  }

  /**
   * Find or create client by phone
   */
  private async findOrCreateClient(parsed: ParsedBooking) {
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

    // Try exact match first
    const nameLower = name.toLowerCase().trim()
    let match = services.find((svc) => svc.name.toLowerCase() === nameLower)

    // Try partial match if exact fails
    if (!match) {
      match = services.find((svc) => svc.name.toLowerCase().includes(nameLower))
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
    notes?: string | null
  }) {
    const { data: existing } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('client_id', data.clientId)
      .eq('employee_id', data.employeeId)
      .eq('service_id', data.serviceId)
      .eq('booking_date', data.bookingDate)
      .eq('booking_time', data.bookingTime)
      .eq('source', 'booksy')
      .neq('status', 'cancelled')
      .maybeSingle()

    if (existing) {
      return existing
    }

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
        notes: data.notes ?? null,
        status: 'scheduled',
        source: 'booksy',
      })
      .select()
      .single()

    if (error) throw error
    return booking
  }

  private async findBookingByEventMarker(eventMarker: string) {
    const { data: booking } = await this.supabase
      .from('bookings')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('source', 'booksy')
      .eq('notes', eventMarker)
      .maybeSingle()

    return booking ?? null
  }
}
