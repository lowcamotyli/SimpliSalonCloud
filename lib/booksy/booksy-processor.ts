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

export class BooksyProcessor {
  constructor(
    private supabase: SupabaseClient,
    private salonId: string
  ) {}

  /**
   * Parse Booksy email and create booking
   */
  async processEmail(subject: string, body: string): Promise<any> {
    try {
      // 1. Parse email
      const parsed = this.parseEmail(subject, body)
      if (!parsed) {
        throw new Error('Could not parse email format')
      }

      // 2. Find or create client
      const client = await this.findOrCreateClient(parsed)

      // 3. Find employee
      const employee = await this.findEmployeeByName(parsed.employeeName)
      if (!employee) {
        throw new Error(`Employee not found: ${parsed.employeeName}`)
      }

      // 4. Find service
      const service = await this.findServiceByName(parsed.serviceName)
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
      })

      return {
        success: true,
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
      // Format: "27 października 2024, 16:00 – 17:00"
      const dateMatch = cleanBody.match(/(\d{1,2})\s+(\w+)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*[-–]\s*(\d{2}):(\d{2})/m)

      if (!dateMatch) {
        console.error('Could not extract date/time from body')
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

      if (!employeeName) {
        console.error('Could not extract employee name')
        return null
      }

      return {
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
      .single()

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
  }) {
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
      })
      .select()
      .single()

    if (error) throw error
    return booking
  }
}
