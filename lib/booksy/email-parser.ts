/**
 * Booksy Email Parser
 * Parsuje emaile z Booksy do struktury booking
 */

interface BooksyEmailData {
  type: 'new' | 'change' | 'cancel'
  clientName: string
  clientPhone: string
  serviceName: string
  price: number
  date: string // YYYY-MM-DD
  time: string // HH:mm
  timeEnd?: string
  duration?: number
  employeeName: string
  oldDate?: string // dla change
  oldTime?: string // dla change
  notes?: string
}

const MONTH_PL_TO_MM: Record<string, string> = {
  'stycznia': '01', 'lutego': '02', 'marca': '03', 'kwietnia': '04',
  'maja': '05', 'czerwca': '06', 'lipca': '07', 'sierpnia': '08',
  'września': '09', 'wrzesnia': '09', 'października': '10', 'pazdziernika': '10',
  'listopada': '11', 'grudnia': '12'
}

export function parseBooksyEmail(subject: string, body: string): BooksyEmailData | null {
  try {
    const lcSubj = subject.toLowerCase()
    const lcBody = body.toLowerCase()

    // Detect type
    let type: 'new' | 'change' | 'cancel' = 'new'
    
    if (/(odwołał|odwołała)\s+wizytę/i.test(lcSubj) || /(odwołał|odwołała)\s+wizytę/i.test(lcBody)) {
      type = 'cancel'
    } else if (/(zmienił|zmieniła|przesunął|przesunęła)\s+(rezerwację|wizytę)/i.test(lcSubj) ||
               /(zmienił|zmieniła|przesunął|przesunęła)\s+(rezerwację|wizytę)/i.test(lcBody)) {
      type = 'change'
    }

    // Extract client name from subject
    // Format: "Klient: nowa rezerwacja" or "Klient: zmienił rezerwację"
    let clientName = ''
    const clientMatch = subject.match(/^(?:re:\s*|fw:\s*)*([^:]+?):\s*(?:nowa|zmienił|zmieniła|odwołał|odwołała)/i)
    if (clientMatch) {
      clientName = clientMatch[1].trim()
    }

    // Extract client phone
    let clientPhone = ''
    const phoneMatch = body.match(/(?:\+?48\s*)?(\d{3}\s*\d{3}\s*\d{3})/i)
    if (phoneMatch) {
      clientPhone = phoneMatch[1].replace(/\s/g, '')
    }

    // Extract date and time range
    // Format: "27 października 2024, 16:41 — 17:11"
    const dateTimeMatch = body.match(
      /(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4}).*?(\d{1,2}:\d{2})\s*[—–-]\s*(\d{1,2}:\d{2})/i
    )

    let date = ''
    let time = ''
    let timeEnd = ''
    let duration = 0

    if (dateTimeMatch) {
      const day = dateTimeMatch[1].padStart(2, '0')
      const month = MONTH_PL_TO_MM[dateTimeMatch[2].toLowerCase()] || '01'
      const year = dateTimeMatch[3]
      time = dateTimeMatch[4]
      timeEnd = dateTimeMatch[5]

      date = `${year}-${month}-${day}`

      // Calculate duration
      const [startH, startM] = time.split(':').map(Number)
      const [endH, endM] = timeEnd.split(':').map(Number)
      duration = (endH * 60 + endM) - (startH * 60 + startM)
    }

    // Extract old date/time for 'change' type
    let oldDate = ''
    let oldTime = ''

    if (type === 'change') {
      const oldMatch = body.match(
        /z dnia.*?(\d{1,2})\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|wrzesnia|października|pazdziernika|listopada|grudnia)\s+(\d{4})\s+(\d{1,2}:\d{2})/i
      )

      if (oldMatch) {
        const day = oldMatch[1].padStart(2, '0')
        const month = MONTH_PL_TO_MM[oldMatch[2].toLowerCase()] || '01'
        const year = oldMatch[3]
        oldTime = oldMatch[4]
        oldDate = `${year}-${month}-${day}`
      }
    }

    // Extract service name and price
    let serviceName = ''
    let price = 0

    // Find line with price (format: "250,00 zł")
    const lines = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    let priceLineIdx = -1

    for (let i = 0; i < lines.length; i++) {
      if (/\d{1,4}(?:[.,]\d{2})\s*zł/i.test(lines[i])) {
        priceLineIdx = i
        break
      }
    }

    if (priceLineIdx !== -1) {
      const priceLine = lines[priceLineIdx]
      const priceMatch = priceLine.match(/(\d{1,4}(?:[.,]\d{2}))\s*zł/i)
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(',', '.'))
      }

      // Service name is usually a few lines before price
      // Look for pattern: "ServiceName: details" or just "ServiceName"
      for (let i = priceLineIdx - 1; i >= Math.max(0, priceLineIdx - 5); i--) {
        const line = lines[i]
        
        // Skip lines with phone, email, price, time
        if (/\d{3}\s*\d{3}\s*\d{3}|@|zł|\d{1,2}:\d{2}/i.test(line)) continue
        if (/^(pracownik|from|to|subject|temat)/i.test(line)) continue
        
        // Extract service name
        const serviceMatch = line.match(/^([A-Za-zÀ-žĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]{3,80})(?:\s*:\s*(.+))?$/i)
        if (serviceMatch) {
          serviceName = serviceMatch[1].trim()
          break
        }
      }
    }

    // Extract employee name
    let employeeName = ''
    const employeeLineIdx = lines.findIndex(l => /^pracownik\s*:/i.test(l))
    
    if (employeeLineIdx !== -1) {
      const empMatch = lines[employeeLineIdx].match(/^pracownik\s*:?\s*(.+)$/i)
      if (empMatch && empMatch[1].trim()) {
        employeeName = empMatch[1].trim().split(/\s+/)[0] // First name only
      } else if (employeeLineIdx + 1 < lines.length) {
        // Name might be on next line
        const nextLine = lines[employeeLineIdx + 1].trim()
        if (/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}$/i.test(nextLine)) {
          employeeName = nextLine
        }
      }
    }

    // Validation
    if (!clientName || !date || !time) {
      console.error('Missing required fields:', { clientName, date, time })
      return null
    }

    return {
      type,
      clientName,
      clientPhone,
      serviceName: serviceName || 'Usługa z Booksy',
      price,
      date,
      time,
      timeEnd,
      duration,
      employeeName,
      oldDate: type === 'change' ? oldDate : undefined,
      oldTime: type === 'change' ? oldTime : undefined,
    }
  } catch (error) {
    console.error('Error parsing Booksy email:', error)
    return null
  }
}

// Test function
export function testBooksyParser() {
  const testEmail = {
    subject: 'Anna Kowalska: nowa rezerwacja',
    body: `
Anna Kowalska
123 456 789
anna@example.com

Strzyżenie damskie wł. średnie
250,00 zł

27 października 2024, 16:41 — 17:11

Pracownik:
Kasia

Zarządzaj swoimi rezerwacjami w aplikacji Booksy
    `
  }

  const result = parseBooksyEmail(testEmail.subject, testEmail.body)
  console.log('Parsed result:', result)
  return result
}