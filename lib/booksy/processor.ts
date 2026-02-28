import { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface ParsedBooking {
  clientName: string
  clientPhone: string
  clientEmail?: string
  serviceName: string
  price: number
  bookingDate: string // YYYY-MM-DD
  bookingTime: string // HH:mm
  employeeName?: string
  duration?: number
}

interface ProcessEmailOptions {
  eventId?: string
  messageId?: string  // Gmail message ID — used to save failed emails for manual review
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
    let parsed: ReturnType<typeof this.parseEmail> = null

    try {
      logger.info('[Booksy] Processing email start')

      const eventMarker = options?.eventId ? `[booksy_event_id:${options.eventId}]` : null

      if (eventMarker) {
        const existingByEvent = await this.findBookingByEventMarker(eventMarker)
        if (existingByEvent) {
          return { success: true, deduplicated: true, booking: existingByEvent }
        }
      }

      // 1. Parse email
      parsed = this.parseEmail(subject, body)
      if (!parsed) {
        throw new Error('Could not parse email format')
      }
      logger.info('[Booksy] Step 1: Email parsed')

      // 2. Find or create client
      logger.info('[Booksy] Step 2: Finding/creating client')
      const client = await this.findOrCreateClient(parsed)
      logger.info('[Booksy] Step 2: Client found/created', { clientId: client.id })

      // 3. Find employee
      logger.info('[Booksy] Step 3: Finding employee')
      const employee = await this.resolveEmployee(parsed.employeeName)
      if (!employee) {
        throw new Error(`Employee not found${parsed.employeeName ? `: ${parsed.employeeName}` : ''}`)
      }
      logger.info('[Booksy] Step 3: Employee found', { employeeId: employee.id })

      // 4. Find service
      logger.info('[Booksy] Step 4: Finding service', { serviceName: parsed.serviceName })
      const service = await this.findServiceByName(parsed.serviceName)
      if (!service) {
        throw new Error(`Service not found: ${parsed.serviceName}`)
      }
      logger.info('[Booksy] Step 4: Service found', { serviceId: service.id })

      // 5. Create booking
      logger.info('[Booksy] Step 5: Creating booking')
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
      logger.info('[Booksy] Step 5: Booking created', { bookingId: booking.id })
      logger.info('[Booksy] Processing email success')

      // If this was previously pending, resolve it
      if (options?.messageId) {
        await this.resolvePendingEmail(options.messageId)
      }

      return { success: true, booking, parsed }
    } catch (error: any) {
      logger.error('[Booksy] Processing email failed', error)

      // Save to pending queue so the user can action it manually
      if (options?.messageId) {
        const reason = error.message.includes('Service not found')
          ? 'service_not_found'
          : error.message.includes('Employee not found')
            ? 'employee_not_found'
            : error.message.includes('Could not parse')
              ? 'parse_failed'
              : 'other'

        await this.savePendingEmail({
          messageId: options.messageId,
          subject,
          body,
          parsed: parsed ?? undefined,
          reason,
          detail: error.message,
        })
      }

      return { success: false, error: error.message, pending: !!options?.messageId }
    }
  }

  /**
   * Parse Booksy email format
   */
  private parseEmail(subject: string, body: string): ParsedBooking | null {
    try {
      // Extract client name from subject: "Anna Kowalska: nowa rezerwacja"
      const nameMatch = subject.match(/^(.+?):\s*nowa rezerwacja/i)
      const rawClientName = nameMatch ? nameMatch[1].trim() : ''
      const clientName = rawClientName.replace(/^(pd|re|fw|fwd)\s*:\s*/i, '').trim()

      if (!clientName) {
        logger.warn('[Booksy] Could not extract client name from subject')
        return null
      }

      // Clean body text (remove special characters and normalize)
      const cleanBody = body
        .replace(/Ă˘â‚¬"/g, '-')
        .replace(/â€"/g, '-')  // em-dash
        .replace(/â€"/g, '-')  // en-dash
        .replace(/Ă…â€š/g, 'Ĺ‚')
        .replace(/Ă…â€ş/g, 'Ĺ›')
        .replace(/Ă„â€¦/g, 'Ä…')
        .replace(/Ă„â€ˇ/g, 'Ä‡')
        .replace(/Ă„â„˘/g, 'Ä™')
        .replace(/Ă…â€ž/g, 'Ĺ„')
        .replace(/ĂÂł/g, 'Ăł')
        .replace(/Ă…Âş/g, 'Ĺş')
        .replace(/Ă…ÂĽ/g, 'ĹĽ')

      logger.info('[Booksy] Parsing email', { subjectLength: subject.length, bodyLength: body.length })

      // Extract phone (9 digits, might have spaces)
      const phoneMatch = cleanBody.match(/(\d{3}\s?\d{3}\s?\d{3})/m)
      const clientPhone = phoneMatch ? phoneMatch[1].replace(/\s/g, '') : ''

      // Extract email (optional)
      const emailMatch = cleanBody.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/m)
      const clientEmail = emailMatch ? emailMatch[1] : undefined

      // Extract service name and price. Booksy email layouts vary.
      let serviceName = ''
      let price = 0
      const serviceMatch = cleanBody.match(/\n\n(.+?)\n([\d,]+)\s*z[łl]/ms)
      if (serviceMatch) {
        serviceName = serviceMatch[1].trim()
        price = parseFloat(serviceMatch[2].replace(',', '.'))
      } else {
        const lines = cleanBody
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)

        const priceLineIndex = lines.findIndex((line) => /[\d]+,\d{2}\s*z[łl]/i.test(line))
        if (priceLineIndex >= 0) {
          const priceMatch = lines[priceLineIndex].match(/([\d]+,\d{2})\s*z[łl]/i)
          if (priceMatch) {
            price = parseFloat(priceMatch[1].replace(',', '.'))
          }

          for (let i = Math.max(0, priceLineIndex - 2); i < priceLineIndex; i++) {
            const line = lines[i]
            if (!line || /https?:\/\//i.test(line) || /mailto:/i.test(line)) continue

            const colonPos = line.indexOf(':')
            if (colonPos >= 0 && colonPos < line.length - 1) {
              serviceName = line.slice(colonPos + 1).trim()
            } else {
              serviceName = line.trim()
            }
          }
        }
      }

      if (!serviceName) {
        logger.warn('[Booksy] Could not reliably extract service name')
      }

      // Extract date and time
      // Format: "27 paĹşdziernika 2024, 16:00 - 17:00" (after cleaning, it's a simple dash)
      // Use .+? instead of \w+ to match Polish characters (Ä…, Ä‡, Ä™, Ĺ‚, Ĺ„, Ăł, Ĺ›, Ĺş, ĹĽ)
      const dateMatch = cleanBody.match(/(\d{1,2})\s+(.+?)\s+(\d{4}),\s+(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/m)

      if (!dateMatch) {
        logger.warn('[Booksy] Could not extract date/time from body')
        return null
      }

      const day = dateMatch[1].padStart(2, '0')
      const monthName = dateMatch[2]
      const year = dateMatch[3]
      const startHour = dateMatch[4]
      const startMinute = dateMatch[5]
      const endHour = dateMatch[6]
      const endMinute = dateMatch[7]

      // Convert Polish month name to number.
      const normalizeText = (value: string) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()

      const monthMap: Record<string, string> = {
        stycznia: '01',
        lutego: '02',
        marca: '03',
        kwietnia: '04',
        maja: '05',
        czerwca: '06',
        lipca: '07',
        sierpnia: '08',
        wrzesnia: '09',
        pazdziernika: '10',
        listopada: '11',
        grudnia: '12',
      }
      const month = monthMap[normalizeText(monthName)] || '01'

      const bookingDate = `${year}-${month}-${day}`
      const bookingTime = `${startHour}:${startMinute}`

      // Calculate duration in minutes
      const startMins = parseInt(startHour) * 60 + parseInt(startMinute)
      const endMins = parseInt(endHour) * 60 + parseInt(endMinute)
      const duration = endMins - startMins

      // Extract employee name
      // Format: "Pracownik:\nKasia"
      const employeeMatch = cleanBody.match(/(?:Pracownik|Specjalista)\s*:\s*(.+?)(?:\n|$)/im)
      const employeeName = employeeMatch ? employeeMatch[1].trim() : undefined

      if (!employeeName) {
        logger.warn('[Booksy] Could not extract employee name - fallback resolution will be used')
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

      logger.info('[Booksy] Email parsed', {
        serviceName: parsed.serviceName,
        date: parsed.bookingDate,
        hasPhone: !!parsed.clientPhone,
        hasEmail: !!parsed.clientEmail,
      })

      return parsed
    } catch (error) {
      logger.error('[Booksy] Parse error', error as Error)
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
    const generatedCode = typeof codeData === 'string' ? codeData.trim() : ''
    const fallbackCode = `B${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`
    const clientCode = generatedCode || fallbackCode

    // Create new client
    const { data: newClient, error } = await this.supabase
      .from('clients')
      .insert({
        salon_id: this.salonId,
        client_code: clientCode,
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
      .is('deleted_at', null)

    if (!employees || employees.length === 0) {
      return null
    }

    const normalizeText = (value: string) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    const nameLower = normalizeText(name)
    const scoreEmployee = (emp: any) => {
      const firstName = normalizeText(emp.first_name || '')
      const lastName = normalizeText(emp.last_name || '')
      const fullName = normalizeText(`${emp.first_name || ''} ${emp.last_name || ''}`)
      const activeBonus = emp.active ? 0.1 : 0
      if (firstName === nameLower || lastName === nameLower || fullName === nameLower) {
        return 3 + activeBonus
      }
      if (firstName.includes(nameLower) || lastName.includes(nameLower) || fullName.includes(nameLower)) {
        return 2 + activeBonus
      }

      const nameTokens = nameLower.split(' ').filter(Boolean)
      const tokenHit = nameTokens.some((t) => firstName.includes(t) || lastName.includes(t) || fullName.includes(t))
      if (tokenHit) {
        return 1 + activeBonus
      }

      return 0
    }

    const ranked = employees
      .map((emp) => ({ emp, score: scoreEmployee(emp) }))
      .sort((a, b) => b.score - a.score)

    if (ranked[0]?.score > 0) {
      return ranked[0].emp
    }

    logger.warn('[Booksy] No employee match', { searchedName: name, candidateCount: employees.length })

    return null
  }

  /**
   * Resolve employee by name, fallback to the only active employee.
   */
  private async resolveEmployee(name?: string) {
    if (name?.trim()) {
      const byName = await this.findEmployeeByName(name)
      if (byName) {
        return byName
      }
    }

    const { data: employees } = await this.supabase
      .from('employees')
      .select('*')
      .eq('salon_id', this.salonId)
      .is('deleted_at', null)

    if (!employees || employees.length === 0) {
      return null
    }

    const activeEmployees = employees.filter((employee) => employee.active)
    if (activeEmployees.length === 1) {
      return activeEmployees[0]
    }

    if (activeEmployees.length === 0 && employees.length === 1) {
      return employees[0]
    }

    return null
  }

  /**
   * Find service by name — 4-level fuzzy matching with Polish diacritic normalization
   */
  private async findServiceByName(name: string) {
    const { data: services, error } = await this.supabase
      .from('services')
      .select('*')
      .eq('salon_id', this.salonId)
      .eq('active', true)

    if (error) {
      logger.error('[Booksy] Failed to fetch services', error)
      return null
    }

    if (!services || services.length === 0) {
      logger.warn('[Booksy] No active services found')
      return null
    }

    const normalize = (s: string) =>
      s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')

    const raw = name.toLowerCase().trim()
    const norm = normalize(name)

    // 1. Exact match
    let match = services.find((svc) => svc.name.toLowerCase().trim() === raw)

    // 2. Exact match after diacritic normalization (handles encoding mismatches)
    if (!match) {
      match = services.find((svc) => normalize(svc.name) === norm)
    }

    // 3. DB name contains parsed name (substring)
    if (!match) {
      match = services.find((svc) => normalize(svc.name).includes(norm))
    }

    // 4. Parsed name contains DB name (reverse substring — shorter DB name)
    if (!match) {
      match = services.find((svc) => norm.includes(normalize(svc.name)))
    }

    if (match) {
      logger.info('[Booksy] Service matched', { serviceId: match.id })
    } else {
      logger.warn('[Booksy] Service not found', { serviceName: name, availableCount: services.length })
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

  /**
   * Save a failed email to booksy_pending_emails for manual review
   */
  private async savePendingEmail(data: {
    messageId: string
    subject: string
    body: string
    parsed?: ParsedBooking | null
    reason: 'parse_failed' | 'service_not_found' | 'employee_not_found' | 'other'
    detail: string
  }) {
    const { error } = await this.supabase
      .from('booksy_pending_emails')
      .upsert(
        {
          salon_id: this.salonId,
          message_id: data.messageId,
          subject: data.subject,
          body_snippet: data.body.slice(0, 2000),
          parsed_data: data.parsed ?? null,
          failure_reason: data.reason,
          failure_detail: data.detail,
          status: 'pending',
        },
        { onConflict: 'salon_id,message_id' }
      )

    if (error) {
      logger.error('[Booksy] Failed to save pending email', error)
    } else {
      logger.info('[Booksy] Saved to pending queue')
    }
  }

  /**
   * Mark a pending email as resolved (booking was created successfully on retry)
   */
  private async resolvePendingEmail(messageId: string) {
    await this.supabase
      .from('booksy_pending_emails')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('salon_id', this.salonId)
      .eq('message_id', messageId)
  }
}
